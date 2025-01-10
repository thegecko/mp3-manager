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
const BACKUP_FILE = 'PBLIST0.DAT';
const HEADER_TEXT = 'WMPLESYS';

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
const fileName = (id: number) => `MP${id.toString(16).padStart(4, '0').toUpperCase()}.DAT`;
const fatTime = (date = new Date()): number => 
    ((date.getFullYear() - 80) << 25) | 
    ((date.getMonth() + 1) << 21) |
    (date.getDate() << 16) |
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);

export class EsysDatabase implements Database {

    public static async create(fileSystem: FileSystemDirectoryHandle): Promise<Database> {
        if (!isEsys(fileSystem)) {
            throw new Error('Invalid folder');
        }

        const rootFolder = await fileSystem.getDirectoryHandle(ROOT_FOLDER);
        const dataFolder = await rootFolder.getDirectoryHandle(DATA_FOLDER);
        const dbHandle = await rootFolder.getFileHandle(DB_FILE);
        const dbFile = await dbHandle.getFile();
        const buffer = await dbFile.arrayBuffer();

        return new EsysDatabase(rootFolder, dataFolder, buffer);
    }

    protected view: DataView;
    protected timestamp: number;
    protected serialNumber: number;
    protected folderCount: number;
    protected trackCount: number;
    protected fileOffset: number;
    protected trackOffset: number;

    protected constructor(
        protected rootFolder: FileSystemDirectoryHandle,
        protected dataFolder: FileSystemDirectoryHandle,
        buffer: ArrayBuffer
    ) {
        this.view = new DataView(buffer);
        this.checkHeader();
        this.timestamp = this.view.getUint32(8);
        this.serialNumber = this.view.getUint32(12); // 145373760
        // 4 byte unknown - not implemented
        this.folderCount = this.view.getUint32(20);
        this.trackCount = this.view.getUint32(24);
        this.fileOffset = 32 + (this.folderCount * 256);
        this.trackOffset = 32 + (this.folderCount * 256) + roundUp(this.trackCount * 2);
    }

    public async getFolders(): Promise<Folder[]> {
        const folders: Folder[] = [];
        let lastOffset = this.trackCount;

        for (let i = this.folderCount - 1; i >= 0; i--) {
            const start = 32 + (i * 256);
            const name = this.getText(start, 252);
            const offset = this.view.getUint32(start + 252);
            const from = (offset - (32 + (this.folderCount * 256))) / 2;
            let tracks: Track[] = [];
            try {
                tracks = await this.getTracks(from, lastOffset);

            } catch (e) {
                console.log(e);
            }
            folders.unshift({ name, offset, tracks });
            lastOffset = from;
        }

        return folders;
    }

    public async setFolders(folders: Folder[]): Promise<boolean> {
        try {
            // Backup
            const backupFile = await this.rootFolder.getFileHandle(BACKUP_FILE, {create: true});
            await this.writeFileHandle(backupFile, this.view.buffer);

            // Re-initialise
            this.folderCount = folders.length;
            const tracks = folders.reduce((acc, folder) => [...acc, ...folder.tracks], [] as Track[]);
            this.trackCount = tracks.length;
            this.fileOffset = 32 + (this.folderCount * 256);
            this.trackOffset = 32 + (this.folderCount * 256) + roundUp(this.trackCount * 2);
            const length = this.trackOffset + (this.trackCount * 768);
            const buffer = new ArrayBuffer(length);
            this.view = new DataView(buffer);

            // Header
            this.createHeader();
            this.checkHeader();

            // Folders
            let offset = this.fileOffset;
            for (let i = 0; i < this.folderCount; i++) {
                const folder = folders[i];
                const start = 32 + (i * 256);
                this.setText(start, folder.name);
                this.view.setUint32(start + 252, offset);
                offset += folder.tracks.length * 2;
            }

            // Tracks
            this.setTracks(tracks);

            // Write data file
            const dbFile = await this.rootFolder.getFileHandle(DB_FILE, {create: true});
            await this.writeFileHandle(dbFile, buffer);

            return true;
        } catch (e) {
            console.log(e);
        }

        return false;
    }

    public async getNextTrackId(): Promise<number> {
        const ids = new Set<number>();

        for (let i = 0; i < this.trackCount; i++) {
            const offset = this.fileOffset + (i * 2);
            const id = this.view.getUint16(offset);
            ids.add(id);
        }

        for (let i = 1; i <= this.trackCount; i++) {
            if (!ids.has(i)) {
                return i;
            }
        }

        return this.trackCount + 1;
    }

    public async readFile(id: number): Promise<ArrayBuffer | undefined> {
        try {
            const fileHandle = await this.dataFolder.getFileHandle(fileName(id));
            const file = await fileHandle.getFile();
            const data = await file.arrayBuffer();
            return this.decodeFile(data);
        } catch (e) {
            console.log(e);
        }
    }

    public async writeFile(id: number, data: ArrayBuffer, duration: number, frames: number): Promise<boolean> {
        try {
            const encoded = this.encodeFile(data, duration, frames);
            const fileHandle = await this.dataFolder.getFileHandle(fileName(id), { create: true });
            await this.writeFileHandle(fileHandle, encoded);
            return true;
        } catch (e) {
            console.log(e);
        }

        return false;
    }

    public async deleteFile(id: number): Promise<boolean> {
        try {
            await this.dataFolder.removeEntry(fileName(id));
            return true;
        } catch (e) {
            console.log(e);
        }

        return false;
    }

    public async writeFileHandle(fileHandle: FileSystemFileHandle, data: ArrayBuffer): Promise<boolean> {
        try {
            const file = await fileHandle.createWritable({ keepExistingData: false });
            await file.write(data);
            await file.close();
            return true;
        } catch (e) {
            console.log(e);
        }

        return false;
    }

    protected checkHeader(): void {
        const buffer = this.view.buffer.slice(0, 8);
        const text = new TextDecoder().decode(buffer);
        if (text !== HEADER_TEXT) {
            console.log(text);
            throw new Error('Invalid db file');
        }

        let lastWord = this.view.getUint32(0);

        for (let i = 4; i < 32; i += 4) {
            lastWord ^= this.view.getUint32(i);
        }

        if (lastWord !== 0) {
            throw new Error('Checksum mismatch');
        }
    }

    protected createHeader(): void {
        // WMPLESYS
        const text = new TextEncoder().encode(HEADER_TEXT);
        new Uint8Array(this.view.buffer).set(text, 0)

        this.view.setUint32(8, this.timestamp);
        this.view.setUint32(12, this.serialNumber);
        // 4 byte unknown - not implemented
        this.view.setUint32(20, this.folderCount);
        this.view.setUint32(24, this.trackCount);

        // 4 byte checksum
        let lastWord = this.view.getUint32(0);
        for (let i = 4; i < 28; i += 4) {
            lastWord ^= this.view.getUint32(i);
        }
        this.view.setUint32(28, lastWord^0);
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

    protected async setTracks(tracks: Track[]): Promise<void> {
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const idOffset = this.fileOffset + (i * 2);
            this.view.setUint16(idOffset, track.id);
            const metaOffset = this.trackOffset + (i * 768);
            this.setText(metaOffset, track.file);
            this.setText(metaOffset + 256, track.name);
            this.setText(metaOffset + 512, track.artist);
        }
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

    protected setText(offest: number, text: string): void {
        for (let i = 0; i < text.length; i++) {
            this.view.setUint16(offest + (i * 2), text.charCodeAt(i));
        }
    }

    protected encodeFile(buffer: ArrayBuffer, duration: number, frames: number): ArrayBuffer {
        // TODO
        return buffer;
    }

    protected decodeFile(buffer: ArrayBuffer): ArrayBuffer {
        // TODO
        return buffer;
    }
}
