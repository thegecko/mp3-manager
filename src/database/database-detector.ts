import { isEsys, EsysDatabase } from './esys-database';
import { isOmg, OmgDatabase } from './omg-database';

export interface Database {
    getFolders(): Promise<Folder[]>;
    setFolders(folders: Folder[]): Promise<void>;
    readFile(id: number): Promise<ArrayBuffer>;
    writeFile(id: number, data: ArrayBuffer): Promise<void>;
    deleteFile(id: number): Promise<void>;
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
