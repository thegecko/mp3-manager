// MP3FileManager v1 - Esys database format
// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT.txt

// Supports
//  Generation 0 (NW-MSx, NW-Ex, NW-S4, NW-E8P, NW-MSxx, NW-HD1, NW-HD2)
//  Generation 1 (NW-Sxx, NW-Exx except NW-E99)
//  Generation 2 (NW-E99)

import { Database, Folder, Track } from './database-detector';

const ROOT_FOLDER = 'ESYS';
const DATA_FOLDER = 'NW-MP3';
const DB_FILE = 'PBLIST1.DAT';

export const isEsys = async (fileSystem: FileSystemDirectoryHandle): Promise<boolean> => {
    // Check for ESYS folder
    try {
        await fileSystem.getDirectoryHandle(ROOT_FOLDER, { create: false });
    } catch (e) {
        // Direcory not found
        return false;
    }

    return true;
};

const roundUp = (input: number, multiple = 8): number => input % multiple ? input + (multiple * 2) - (input % multiple) : input;

export class EsysDatabase implements Database {

    public static async create(fileSystem: FileSystemDirectoryHandle): Promise<Database> {
        if (!isEsys(fileSystem)) {
            throw new Error('Invalid folder');
        }

        const rootHandle = await fileSystem.getDirectoryHandle(ROOT_FOLDER);
        const dataHandle = await rootHandle.getDirectoryHandle(DATA_FOLDER);
        const dbHandle = await rootHandle.getFileHandle(DB_FILE);
        const dbFile = await dbHandle.getFile();
        const buffer = await dbFile.arrayBuffer();

        return new EsysDatabase(dataHandle, dbFile, buffer);
    }

    protected view: DataView;
    protected folderCount: number;
    protected trackCount: number;
    protected fileOffset: number;
    protected trackOffset: number;

    protected constructor(
        protected dataFolder: FileSystemDirectoryHandle,
        protected dbFile: File,
        buffer: ArrayBuffer
    ) {
        this.view = new DataView(buffer);
        this.folderCount = this.view.getUint32(20);
        this.trackCount = this.view.getUint32(24);
        this.fileOffset = 32 + (this.folderCount * 256);
        this.trackOffset = 32 + (this.folderCount * 256) + roundUp(this.trackCount * 2);
    }

    public setFolders(folders: Folder[]): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public readFile(id: number): Promise<ArrayBuffer> {
        throw new Error('Method not implemented.');
    }

    public writeFile(id: number, data: ArrayBuffer): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public deleteFile(id: number): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public async getFolders(): Promise<Folder[]> {
        const folders: Folder[] = [];
        let lastOffset = this.trackCount;

        for (let i = this.folderCount - 1; i >= 0; i--) {
            const start = 32 + (i * 256);
            const name = this.getText(start, 252);
            const offset = this.view.getUint32(start + 252);
            const from = (offset - (32 + (this.folderCount * 256))) / 2;
            const tracks = await this.getTracks(from, lastOffset);
            folders.unshift({ name, offset, tracks });
            lastOffset = from;
        }

        return folders;
    }

    protected async getTracks(from = 0, to = this.trackCount): Promise<Track[]> {
        const tracks: Track[] = [];

        for (let i = from; i < to; i++) {
            const idOffset = this.fileOffset + (i * 2);
            const id = this.view.getUint16(idOffset);
            const metaOffset = this.trackOffset + (i * 768);
            const file = this.getText(metaOffset, 256);
            const name = this.getText(metaOffset + 256, 256);
            const artist = this.getText(metaOffset + 512, 256);
            tracks.push({ id, file, name, artist });
        }

        return tracks;
    }

    protected getText(offest: number, length: number): string {
        let terminator = 0;

        for (let j = 0; j < length; j++) {
            if (this.view.getUint16(offest + j) === 0) {
                terminator = j;
                break;
            }
        }

        const bytes = this.view.buffer.slice(offest, offest + terminator);
        return new TextDecoder('UTF-16BE').decode(bytes).trim();
    }
}
