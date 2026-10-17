import type { Database, Folder, Track } from '../database/database-detector';

export const MP3_EXTENSION = 'mp3';
export const NEW_ID = -99;

const isFile = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

export interface FileAndFolder {
    file: File;
    folder?: string;
}

export interface Card {
    id: number;
    type: 'folder' | 'track' | 'new';
    name: string;
    artist?: string;
    file?: string;
}

const folderToCard = (folder: Folder): Card => ({
    id: folder.id,
    type: 'folder',
    name: folder.name
});

const trackToCard = (track: Track): Card => ({
    id: track.id,
    type: 'track',
    name: track.name,
    artist: track.artist,
    file: track.file
});

const cardToFolder = (card: Card): Folder => ({
    id: card.id,
    name: card.name,
    tracks: []
});

const cardToTrack = (card: Card): Track => ({
    id: card.id,
    name: card.name,
    artist: card.artist || '',
    file: card.file || ''
});

export const newFolder = (name: string, tracks: Track[] = []): Folder => ({
    name,
    id: -1,
    tracks
});

export const getFiles = async (transfer: DataTransfer, filter = MP3_EXTENSION): Promise<FileAndFolder[]> => {
    const files: FileAndFolder[] = [];

    const addFile = async (entry: FileSystemEntry, folder?: string) => {
        if (isFile(entry) && entry.name.endsWith(filter)) {
            const file = await new Promise<File>(resolve => entry.file(resolve));
            files.push({ file, folder });
        }
    };

    // Hold references or they disappear after first await
    const entries = [...transfer.items]
        .map(item => item.webkitGetAsEntry())
        .filter(entry => !!entry);

    for (const entry of entries) {
        if (isFile(entry)) {
            await addFile(entry);
        } else if (isDirectory(entry)) {
            const reader = entry.createReader();
            const files = await new Promise<FileSystemEntry[]>(resolve => reader.readEntries(resolve));
            for (const file of files) {
                await addFile(file, entry.name);
            }
        }
    }

    return files;
};

export const getCards = (folders: Folder[]): Card[] => {
    const cards: Card[] = [];
    for (const folder of folders) {
        cards.push(folderToCard(folder));
        for (const track of folder.tracks) {
            cards.push(trackToCard(track));
        }
    }
    return cards;
};

export const buildFolders = (cards: Card[], data?: { newFolders?: Map<string, Track[]>, newTracks?: Track[], deleteId?: number }): Folder[] => {
    const { newFolders, newTracks, deleteId } = data || {};

    const folders: Folder[] = [];
    let currentFolder: Folder | undefined;
    let deletingTracks = false;
    let nextFolders: Folder[] = [];

    for (const card of cards) {
        switch (card.type) {
            case 'folder': {
                deletingTracks = false;

                if (currentFolder) {
                    folders.push(currentFolder);
                    currentFolder = undefined;
                }

                if (deleteId === card.id) {
                    deletingTracks = true;
                    continue;
                }

                if (nextFolders) {
                    folders.push(...nextFolders);
                    nextFolders = [];
                }

                currentFolder = cardToFolder(card);
                break;
            }
            case 'track': {
                if (deletingTracks || deleteId === card.id) {
                    continue;
                }

                if (!currentFolder) {
                    currentFolder = newFolder('New Folder');
                }

                const track = cardToTrack(card);
                currentFolder.tracks.push(track);
                break;
            }
            case 'new': {
                if (!currentFolder) {
                    currentFolder = newFolder('New Folder');
                }

                if (newTracks) {
                    currentFolder.tracks.push(...newTracks);
                }

                if (newFolders && newFolders.size > 0) {
                    nextFolders = [...newFolders.keys()].map(name => newFolder(name, newFolders.get(name)));
                }
                break;
            }
        }
    }

    if (currentFolder) {
        folders.push(currentFolder);
    }

    if (nextFolders) {
        folders.push(...nextFolders);
    }

    return folders;
};

export const createFile = async (db: Database, file: File): Promise<Track | undefined> => {
    if (!db) {
        throw new Error('No database');
    }

    try {
        const id = await db.getNextTrackId();
        const duration = await getDuration(file);
        const frames = estimateMp3Frames(duration);

        const track = await db.writeFile(id, file, duration, frames);
        return track;
    } catch (e) {
        console.error(e);
    }
};

export const createZip = async (name: string, files: File[]): Promise<File> => {
    const parts: BlobPart[] = [];
    const directory: BlobPart[] = [];
    let offset = 0;

    for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        const path = new TextEncoder().encode(file.name);
        const crc = crc32(data);
        const header = new Uint8Array(30 + path.length);
        const view = new DataView(header.buffer);
        writeHeader(view, 0x04034b50, path, crc, data.length);
        header.set(path, 30);
        parts.push(header, data);

        const entry = new Uint8Array(46 + path.length);
        const entryView = new DataView(entry.buffer);
        writeHeader(entryView, 0x02014b50, path, crc, data.length, offset);
        entryView.setUint16(4, 20, true);
        entry.set(path, 46);
        directory.push(entry);
        offset += header.length + data.length;
    }

    const directorySize = directory.reduce((total, part) => total + (part as Uint8Array).byteLength, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, directorySize, true);
    endView.setUint32(16, offset, true);

    return new File([...parts, ...directory, end], `${name}.zip`, { type: 'application/zip' });
};

const writeHeader = (view: DataView, signature: number, path: Uint8Array, crc: number, size: number, offset = 0): void => {
    view.setUint32(0, signature, true);
    view.setUint16(signature === 0x02014b50 ? 6 : 4, 20, true);
    view.setUint32(signature === 0x02014b50 ? 16 : 14, crc, true);
    view.setUint32(signature === 0x02014b50 ? 20 : 18, size, true);
    view.setUint32(signature === 0x02014b50 ? 24 : 22, size, true);
    view.setUint16(signature === 0x02014b50 ? 28 : 26, path.length, true);
    if (signature === 0x02014b50) {
        view.setUint32(42, offset, true);
    }
};

const crc32 = (data: Uint8Array): number => {
    let crc = -1;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ -1) >>> 0;
};

const getDuration = async (file: File): Promise<number> => {
    const url = URL.createObjectURL(file);
    try {
        const audio = new Audio(url);
        audio.preload = 'metadata';

        await new Promise<void>((resolve, reject) => {
            audio.onloadedmetadata = () => resolve();
            audio.onerror = () => reject(new Error('Unable to read audio metadata'));
        });

        return Math.round(audio.duration * 1000);
    } finally {
        URL.revokeObjectURL(url);
    }
};

const estimateMp3Frames = (duration: number): number => {
    // Existing code used decoded PCM samples here, not MPEG frame count. This is closer for common 44.1kHz Layer III files.
    return Math.round((duration / 1000) * 44100 / 1152);
};
