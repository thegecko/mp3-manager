import { isEsys, EsysDatabase } from './esys-database';
import { isOmg, OmgDatabase } from './omg-database';
export interface Database {
    type: 'esys' | 'omg';
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
    if (await isOmg(fileSystem)) {
        return OmgDatabase.create(fileSystem);
    }

    if (await isEsys(fileSystem)) {
        return EsysDatabase.create(fileSystem);
    }

    throw new Error('Not a valid mp3 folder');
};
