import { isEsys, EsysDatabase } from './esys-database';
import { isOmg, OmgDatabase } from './omg-database';
import { elapsed, log } from '../log';
export interface Database {
    type: 'ESYS' | 'OMG';
    getFolders(): Promise<Folder[]>;
    setFolders(folders: Folder[]): Promise<boolean>;
    getNextTrackId(): Promise<number>;
    readFile(id: number): Promise<ArrayBuffer | undefined>;
    streamFile(id: number): Promise<File | undefined>;
    writeFile(id: number, file: File, duration: number, frames: number): Promise<Track | undefined>;
    deleteFile(id: number): Promise<boolean>;
    createInitFile(device: USBDevice): Promise<File>;
}

export interface Folder {
    id: number;
    name: string;
    tracks: Track[];
}

export interface Track {
    id: number;
    name: string;
    file: string;
    artist: string;
}

export const detectDatabase = async (fileSystem: FileSystemDirectoryHandle): Promise<Database> => {
    const start = performance.now();
    log('database detect: start', { root: fileSystem.name });
    if (await isOmg(fileSystem)) {
        log('database detect: OMGAUDIO folder found', { elapsed: elapsed(start) });
        const database = await OmgDatabase.create(fileSystem);
        log('database detect: loaded OMG database', { elapsed: elapsed(start) });
        return database;
    }

    if (await isEsys(fileSystem)) {
        log('database detect: ESYS folder found', { elapsed: elapsed(start) });
        const database = await EsysDatabase.create(fileSystem);
        log('database detect: loaded ESYS database', { elapsed: elapsed(start) });
        return database;
    }

    log('database detect: no supported database found', { elapsed: elapsed(start) });
    throw new Error('Not a valid mp3 folder');
};
