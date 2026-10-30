import type { Database, Folder, Track } from '../database/database-detector';
import { elapsed, log, warn } from '../log';

export const MP3_EXTENSION = 'mp3';
export const NEW_ID = -99;
const METADATA_TIMEOUT = 5000;
const FILE_ENTRY_TIMEOUT = 5000;

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
    const start = performance.now();
    const files: FileAndFolder[] = [];
    const matchesFilter = (name: string): boolean => name.toLowerCase().endsWith(filter.toLowerCase());

    const withTimeout = async <T,>(promise: Promise<T>, message: string): Promise<T> => {
        let timeout: number | undefined;
        try {
            return await Promise.race([
                promise,
                new Promise<T>((_resolve, reject) => {
                    timeout = setTimeout(() => reject(new Error(message)), FILE_ENTRY_TIMEOUT);
                })
            ]);
        } finally {
            clearTimeout(timeout);
        }
    };

    const readEntryFile = async (entry: FileSystemFileEntry): Promise<File> =>
        withTimeout(new Promise<File>((resolve, reject) => entry.file(resolve, reject)), `Timed out reading dropped file ${entry.name}`);

    const readDirectoryEntries = async (entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
        const reader = entry.createReader();
        const entries: FileSystemEntry[] = [];
        while (true) {
            const batch = await withTimeout(
                new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject)),
                `Timed out reading dropped directory ${entry.name}`
            );
            log('drop upload: directory entries read', { folder: entry.name, count: batch.length, elapsed: elapsed(start) });
            if (batch.length === 0) {
                return entries;
            }
            entries.push(...batch);
        }
    };

    const addFile = async (entry: FileSystemEntry, folder?: string) => {
        if (isFile(entry) && matchesFilter(entry.name)) {
            log('drop upload: reading dropped file', { name: entry.name, folder, elapsed: elapsed(start) });
            const file = await readEntryFile(entry);
            files.push({ file, folder });
            log('drop upload: dropped file ready', { name: file.name, size: file.size, folder, elapsed: elapsed(start) });
        } else if (isFile(entry)) {
            log('drop upload: skipping non-mp3 file', { name: entry.name, folder });
        }
    };

    // Hold references or they disappear after first await
    const entries = [...transfer.items]
        .map(item => ({ item, entry: item.webkitGetAsEntry() }))
        .filter(({ entry }) => !!entry) as { item: DataTransferItem, entry: FileSystemEntry }[];
    log('drop upload: enumerating data transfer', { items: transfer.items.length, entries: entries.length, elapsed: elapsed(start) });

    for (const { item, entry } of entries) {
        if (isFile(entry)) {
            const file = item.getAsFile();
            if (file && matchesFilter(file.name)) {
                files.push({ file });
                log('drop upload: dropped file ready from data transfer item', { name: file.name, size: file.size, elapsed: elapsed(start) });
            } else if (file) {
                log('drop upload: skipping non-mp3 file', { name: file.name });
            } else {
                await addFile(entry);
            }
        } else if (isDirectory(entry)) {
            log('drop upload: reading dropped directory', { name: entry.name, elapsed: elapsed(start) });
            const files = await readDirectoryEntries(entry);
            for (const file of files) {
                await addFile(file, entry.name);
            }
        }
    }

    log('drop upload: enumeration complete', { count: files.length, elapsed: elapsed(start) });
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

    const start = performance.now();
    try {
        log('upload: allocating track id', { file: file.name, size: file.size, type: file.type, db: db.type });
        const id = await db.getNextTrackId();
        log('upload: allocated track id', { id, elapsed: elapsed(start) });

        log('upload: reading audio metadata', { id, file: file.name });
        const duration = await getDuration(file);
        const frames = estimateMp3Frames(duration);
        log('upload: audio metadata ready', { id, duration, frames, elapsed: elapsed(start) });

        log('upload: writing device file', { id, file: file.name });
        const track = await db.writeFile(id, file, duration, frames);
        log('upload: device file write complete', { id, track, elapsed: elapsed(start) });
        return track;
    } catch (e) {
        warn('upload: failed', { file: file.name, elapsed: elapsed(start), error: e });
    }
};

const getDuration = async (file: File): Promise<number> => {
    const url = URL.createObjectURL(file);
    const start = performance.now();
    try {
        const audio = new Audio(url);
        audio.preload = 'metadata';

        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timeout);
                audio.onloadedmetadata = null;
                audio.onerror = null;
            };
            const complete = (fn: () => void): void => {
                cleanup();
                fn();
            };
            const timeout = setTimeout(() => complete(() => reject(new Error('Timed out reading audio metadata'))), METADATA_TIMEOUT);
            audio.onloadedmetadata = () => complete(resolve);
            audio.onerror = () => complete(() => reject(new Error('Unable to read audio metadata')));
            audio.load();
        });

        const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0;
        log('upload: browser metadata loaded', { file: file.name, duration, elapsed: elapsed(start) });
        return duration;
    } catch (e) {
        warn(`upload: unable to read duration for ${file.name}; importing with duration 0`, { elapsed: elapsed(start), error: e });
        return 0;
    } finally {
        URL.revokeObjectURL(url);
    }
};

const estimateMp3Frames = (duration: number): number => {
    // Existing code used decoded PCM samples here, not MPEG frame count. This is closer for common 44.1kHz Layer III files.
    return Math.round((duration / 1000) * 44100 / 1152);
};
