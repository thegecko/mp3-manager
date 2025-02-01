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

export const createFile = async (db: Database, buffer: ArrayBuffer, name?: string): Promise<Track | undefined> => {
    if (!db) {
        throw new Error('No database');
    }

    try {
        const id = await db.getNextTrackId();

        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buffer.slice(0));
        const duration = Math.round(audio.duration * 1000);

        const track = await db.writeFile(id, buffer, duration, audio.length, name);
        return track;
    } catch (e) {
        console.error(e);
    }
};
