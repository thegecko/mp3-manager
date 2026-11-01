import type { Database, Folder, Track } from '../database/database-detector';
import { elapsed, log, warn } from '../log';

export const MP3_EXTENSION = 'mp3';
export const NEW_ID = -99;
const METADATA_TIMEOUT = 5000;
const FILE_ENTRY_TIMEOUT = 5000;
const PLAYLIST_EXTENSIONS = ['.m3u8', '.m3u'];

const isFile = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

export interface FileAndFolder {
    file: File;
    folder?: string;
}

export interface PlaylistAndFolder {
    name: string;
    text: string;
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

export const isPlaylistFileName = (name: string): boolean => PLAYLIST_EXTENSIONS.some(extension => name.toLowerCase().endsWith(extension));

const normalisePlaylistEntry = (entry: string): string => {
    const clean = entry.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    return clean.split('/').filter(Boolean).pop()?.toLowerCase() || clean.toLowerCase();
};

const playlistNames = (playlist: PlaylistAndFolder): string[] => playlist.text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(normalisePlaylistEntry)
    .filter(Boolean);

const folderKey = (folder?: string): string => folder || '';

export const orderByFolderPlaylists = <T,>(items: T[], playlists: PlaylistAndFolder[], getName: (item: T) => string, getFolder: (item: T) => string | undefined): T[] => {
    const playlistsByFolder = new Map<string, PlaylistAndFolder[]>();
    for (const playlist of playlists) {
        const key = folderKey(playlist.folder);
        playlistsByFolder.set(key, [...(playlistsByFolder.get(key) || []), playlist]);
    }

    const orderForFolder = (folder?: string): Map<string, number> => {
        const folderPlaylists = [...(playlistsByFolder.get(folderKey(folder)) || [])]
            .sort((a, b) => {
                const aIsM3u8 = a.name.toLowerCase().endsWith('.m3u8') ? 0 : 1;
                const bIsM3u8 = b.name.toLowerCase().endsWith('.m3u8') ? 0 : 1;
                return aIsM3u8 - bIsM3u8 || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            });

        const order = new Map<string, number>();
        for (const playlist of folderPlaylists) {
            for (const name of playlistNames(playlist)) {
                if (!order.has(name)) {
                    order.set(name, order.size);
                }
            }
        }
        return order;
    };

    const orderCache = new Map<string, Map<string, number>>();
    const getOrder = (folder?: string): Map<string, number> => {
        const key = folderKey(folder);
        if (!orderCache.has(key)) {
            orderCache.set(key, orderForFolder(folder));
        }
        return orderCache.get(key)!;
    };

    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const aFolder = getFolder(a.item);
            const bFolder = getFolder(b.item);
            if (folderKey(aFolder) !== folderKey(bFolder)) {
                return a.index - b.index;
            }

            const order = getOrder(aFolder);
            const aOrder = order.get(normalisePlaylistEntry(getName(a.item)));
            const bOrder = order.get(normalisePlaylistEntry(getName(b.item)));
            if (aOrder !== undefined && bOrder !== undefined) {
                return aOrder - bOrder || a.index - b.index;
            }
            if (aOrder !== undefined) {
                return -1;
            }
            if (bOrder !== undefined) {
                return 1;
            }
            return a.index - b.index;
        })
        .map(({ item }) => item);
};

export const getFiles = async (transfer: DataTransfer, filter = MP3_EXTENSION): Promise<FileAndFolder[]> => {
    const start = performance.now();
    const files: FileAndFolder[] = [];
    const playlists: PlaylistAndFolder[] = [];
    const matchesFilter = (name: string): boolean => name.toLowerCase().endsWith(filter.toLowerCase());

    const addHandle = async (handle: FileSystemHandle, parentFolder?: string) => {
        if (handle.kind === 'file') {
            const fileHandle = handle as FileSystemFileHandle;
            if (matchesFilter(fileHandle.name)) {
                log('drop upload: reading dropped handle file', { name: fileHandle.name, folder: parentFolder, elapsed: elapsed(start) });
                const file = await fileHandle.getFile();
                files.push({ file, folder: parentFolder });
                log('drop upload: dropped handle file ready', { name: file.name, size: file.size, folder: parentFolder, elapsed: elapsed(start) });
            } else if (isPlaylistFileName(fileHandle.name)) {
                log('drop upload: reading dropped handle playlist', { name: fileHandle.name, folder: parentFolder, elapsed: elapsed(start) });
                const file = await fileHandle.getFile();
                playlists.push({ name: file.name, text: await file.text(), folder: parentFolder });
            } else {
                log('drop upload: skipping non-mp3 handle file', { name: fileHandle.name, folder: parentFolder });
            }
            return;
        }

        const directoryHandle = handle as FileSystemDirectoryHandle;
        log('drop upload: reading dropped handle directory', { name: directoryHandle.name, parentFolder, elapsed: elapsed(start) });
        let count = 0;
        for await (const childHandle of directoryHandle.values()) {
            count++;
            await addHandle(childHandle, directoryHandle.name);
        }
        log('drop upload: handle directory read', { name: directoryHandle.name, parentFolder, count, elapsed: elapsed(start) });
    };

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
        } else if (isFile(entry) && isPlaylistFileName(entry.name)) {
            log('drop upload: reading dropped playlist', { name: entry.name, folder, elapsed: elapsed(start) });
            const file = await readEntryFile(entry);
            playlists.push({ name: file.name, text: await file.text(), folder });
        } else if (isFile(entry)) {
            log('drop upload: skipping non-mp3 file', { name: entry.name, folder });
        }
    };

    const addEntry = async (entry: FileSystemEntry, parentFolder?: string) => {
        if (isFile(entry)) {
            await addFile(entry, parentFolder);
            return;
        }

        if (isDirectory(entry)) {
            log('drop upload: reading dropped directory', { name: entry.name, parentFolder, elapsed: elapsed(start) });
            const childEntries = await readDirectoryEntries(entry);
            for (const childEntry of childEntries) {
                await addEntry(childEntry, entry.name);
            }
        }
    };

    // Hold references or they disappear after first await. Also request every
    // File System Access handle before reading any directory contents; browsers
    // can expire later DataTransferItem handles once async file reads begin.
    const items = [...transfer.items];
    const transferFiles = [...transfer.files];
    const itemSources = items.map(item => {
        const getAsFileSystemHandle = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle;
        const handle = getAsFileSystemHandle
            ? getAsFileSystemHandle.call(item).catch(error => {
                warn('drop upload: file system handle path failed; falling back to legacy entry path', { error });
                return null;
            })
            : undefined;

        return {
            item,
            handle,
            entry: item.webkitGetAsEntry()
        };
    });
    const legacyEntries: { item: DataTransferItem, entry: FileSystemEntry }[] = [];
    let handledWithFileSystemAccess = 0;

    for (const source of itemSources) {
        const handle = source.handle ? await source.handle : undefined;
        if (handle) {
            handledWithFileSystemAccess++;
            await addHandle(handle);
            continue;
        }

        if (source.entry) {
            legacyEntries.push({ item: source.item, entry: source.entry });
        }
    }

    log('drop upload: enumerating data transfer', { items: items.length, handles: handledWithFileSystemAccess, entries: legacyEntries.length, elapsed: elapsed(start) });

    if (legacyEntries.length === 0 && handledWithFileSystemAccess === 0 && transferFiles.length > 0) {
        for (const file of transferFiles) {
            if (matchesFilter(file.name)) {
                files.push({ file });
                log('drop upload: dropped file ready from file list', { name: file.name, size: file.size, elapsed: elapsed(start) });
            } else if (isPlaylistFileName(file.name)) {
                playlists.push({ name: file.name, text: await file.text() });
                log('drop upload: dropped playlist ready from file list', { name: file.name, size: file.size, elapsed: elapsed(start) });
            } else {
                log('drop upload: skipping non-mp3 file', { name: file.name });
            }
        }
    }

    for (const { item, entry } of legacyEntries) {
        if (isFile(entry)) {
            const file = item.getAsFile();
            if (file && matchesFilter(file.name)) {
                files.push({ file });
                log('drop upload: dropped file ready from data transfer item', { name: file.name, size: file.size, elapsed: elapsed(start) });
            } else if (file && isPlaylistFileName(file.name)) {
                playlists.push({ name: file.name, text: await file.text() });
                log('drop upload: dropped playlist ready from data transfer item', { name: file.name, size: file.size, elapsed: elapsed(start) });
            } else if (file) {
                log('drop upload: skipping non-mp3 file', { name: file.name });
            } else {
                await addFile(entry);
            }
        } else if (isDirectory(entry)) {
            await addEntry(entry);
        }
    }

    const orderedFiles = orderByFolderPlaylists(files, playlists, item => item.file.name, item => item.folder);
    log('drop upload: enumeration complete', { count: orderedFiles.length, playlists: playlists.length, elapsed: elapsed(start) });
    return orderedFiles;
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
