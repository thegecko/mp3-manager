import { isEsys, EsysDatabase } from './esys-database';
import { isOmg, OmgDatabase } from './omg-database';

export interface Database {
    getFolders(): Promise<Folder[]>;
    setFolders(folders: Folder[]): Promise<boolean>;
    getNextTrackId(idFrom?: number): Promise<number>;
    readFile(id: number): Promise<ArrayBuffer | undefined>;
    writeFile(id: number, data: ArrayBuffer, duration: number, frames: number): Promise<boolean>;
    deleteFile(id: number): Promise<boolean>;
}

export interface Folder {
    offset: number;
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
    if (await isEsys(fileSystem)) {
        return EsysDatabase.create(fileSystem);
    }

    if (await isOmg(fileSystem)) {
        return OmgDatabase.create(fileSystem);
    }

    throw new Error('Not a valid mp3 folder');
};
