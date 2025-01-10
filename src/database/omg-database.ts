// MP3FileManager v2 - OmgAudio database format (not implemented)
// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT_v2.txt

// Supports
//  Generation 3 (NW-HD3, NW-HD5, NW-E10x/E2xx/E3xx/E4xx/E5xx)
//  Generation 4 (NW-A1000, NW-A1200, NW-A3000, NW-A60x)
//  Generation 5 (NW-E00x)
//  Generation 6 (NW-S20x)
//  Generation 7 (NW-E01x, NW-S60x/S70x, NW-S71x, NW-A80x, NW-A91x)
//  Vaio (VGF-AP1)

import { Database, Folder } from './database-detector';

const ROOT_FOLDER = 'OMGAUDIO';

export const isOmg = async (fileSystem: FileSystemDirectoryHandle): Promise<boolean> => {
    // Check for OMGAUDIO folder
    try {
        await fileSystem.getDirectoryHandle(ROOT_FOLDER, { create: false });
    } catch (e) {
        // Direcory not found
        return false;
    }

    return true;
};

export class OmgDatabase implements Database {
    public static async create(fileSystem: FileSystemDirectoryHandle): Promise<Database> {
        if (!isOmg(fileSystem)) {
            throw new Error('Invalid folder');
        }

        throw new Error('OMGAudio support not implemented, please consider creating a PR at https://github.com/thegecko/mp3-manager');
    }

    public getFolders(): Promise<Folder[]> {
        throw new Error('Method not implemented.');
    }

    public setFolders(folders: Folder[]): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    public getNextTrackId(idFrom?: number): Promise<number> {
        throw new Error('Method not implemented.');
    }

    public readFile(id: number): Promise<ArrayBuffer | undefined> {
        throw new Error('Method not implemented.');
    }

    public writeFile(id: number, data: ArrayBuffer, duration: number, frames: number): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    public deleteFile(id: number): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
}
