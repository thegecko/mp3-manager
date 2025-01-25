// MP3FileManager v1 - Esys database format
// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT.txt

// Supports
//  Generation 0 (NW-MSx, NW-Ex, NW-S4, NW-E8P, NW-MSxx, NW-HD1, NW-HD2)
//  Generation 1 (NW-Sxx, NW-Exx except NW-E99)
//  Generation 2 (NW-E99)

import { removeId3 } from '../id3';
import { Database, Folder, Track } from './database-detector';

const ROOT_FOLDER = 'ESYS';
const DATA_FOLDER = 'NW-MP3';
const DB_FILE = 'PBLIST1.DAT';
const BACKUP_FILE = 'PBLIST0.DAT';
const DB_HEADER_TEXT = 'WMPLESYS';
const TRACK_HEADER_TEXT = 'WMMP';
const HEADER_SIZE = 32;

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

// Round up to the nearest 16 bytes
const roundUp = (input: number, multiple = 16) => Math.ceil(input / multiple) * multiple;
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
    protected trackIds: Set<number> | undefined;

    protected constructor(
        protected rootFolder: FileSystemDirectoryHandle,
        protected dataFolder: FileSystemDirectoryHandle,
        buffer: ArrayBuffer
    ) {
        this.view = new DataView(buffer);
        this.checkHeader();
        this.timestamp = this.view.getUint32(8);
        this.serialNumber = this.view.getUint32(12);
        // 4 byte unknown - not implemented
        this.folderCount = this.view.getUint32(20);
        this.trackCount = this.view.getUint32(24);
        this.fileOffset = HEADER_SIZE + (this.folderCount * 256);
        this.trackOffset = this.fileOffset + roundUp(this.trackCount * 2);
    }

    public async getFolders(): Promise<Folder[]> {
        const folders: Folder[] = [];
        let lastOffset = this.trackCount;

        for (let i = this.folderCount - 1; i >= 0; i--) {
            const start = HEADER_SIZE + (i * 256);
            const name = this.getText(start, 252);
            const offset = this.view.getUint32(start + 252);
            let tracks: Track[] = [];
            if (offset > 0) {
                try {
                    const from = (offset - this.fileOffset) / 2;
                    tracks = await this.getTracks(from, lastOffset);
                    lastOffset = from;
                } catch (e) {
                    console.error(e);
                }
            }
            folders.unshift({ name, id: -1 - i, tracks });
        }

        return folders;
    }

    public async setFolders(folders: Folder[]): Promise<boolean> {
        try {
            // Backup
            const backupFile = await this.rootFolder.getFileHandle(BACKUP_FILE, { create: true });
            await this.writeFileHandle(backupFile, this.view.buffer);

            // Re-initialise
            this.trackIds = undefined;
            this.folderCount = folders.length;
            const tracks = folders.reduce((acc, folder) => [...acc, ...folder.tracks], [] as Track[]);
            this.trackCount = tracks.length;
            this.fileOffset = HEADER_SIZE + (this.folderCount * 256);
            this.trackOffset = this.fileOffset + roundUp(this.trackCount * 2);
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
                const start = HEADER_SIZE + (i * 256);
                this.setText(start, folder.name);
                if (folder.tracks.length === 0) {
                    this.view.setUint32(start + 252, 0);
                } else {
                    this.view.setUint32(start + 252, offset);
                    offset += folder.tracks.length * 2;
                }
            }

            // Tracks
            this.setTracks(tracks);

            // Write data file
            const dbFile = await this.rootFolder.getFileHandle(DB_FILE, { create: true });
            await this.writeFileHandle(dbFile, buffer);

            return true;
        } catch (e) {
            console.error(e);
        }

        return false;
    }

    public async getNextTrackId(): Promise<number> {
        if (this.trackIds === undefined) {
            this.trackIds = new Set<number>();
            for (let i = 0; i < this.trackCount; i++) {
                const offset = this.fileOffset + (i * 2);
                const id = this.view.getUint16(offset);
                this.trackIds.add(id);
            }
        }

        let id: number | undefined;
        for (let i = 1; i <= this.trackIds.size; i++) {
            if (!this.trackIds.has(i)) {
                id = i;
                break;
            }
        }

        if (id === undefined) {
            id = this.trackIds.size + 1;
        }

        this.trackIds.add(id);
        return id;
    }

    public async readFile(id: number): Promise<ArrayBuffer | undefined> {
        try {
            const fileHandle = await this.dataFolder.getFileHandle(fileName(id));
            const file = await fileHandle.getFile();
            const data = await file.arrayBuffer();
            return this.decodeFile(data);
        } catch (e) {
            console.error(e);
        }
    }

    public async writeFile(id: number, data: ArrayBuffer, duration: number, frames: number): Promise<boolean> {
        try {
            const encoded = this.encodeFile(id, data, duration, frames);
            const fileHandle = await this.dataFolder.getFileHandle(fileName(id), { create: true });
            await this.writeFileHandle(fileHandle, encoded);
            return true;
        } catch (e) {
            console.error(e);
        }

        return false;
    }

    public async deleteFile(id: number): Promise<boolean> {
        try {
            await this.dataFolder.removeEntry(fileName(id));
            return true;
        } catch (e) {
            console.error(e);
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
            console.error(e);
        }

        return false;
    }

    protected checkHeader(): void {
        const buffer = this.view.buffer.slice(0, 8);
        const text = new TextDecoder().decode(buffer);
        if (text !== DB_HEADER_TEXT) {
            throw new Error('Invalid db file');
        }

        let lastWord = this.view.getUint32(0);

        for (let i = 4; i < HEADER_SIZE; i += 4) {
            lastWord ^= this.view.getUint32(i);
        }

        if (lastWord !== 0) {
            throw new Error('Checksum mismatch');
        }
    }

    protected createHeader(): void {
        // WMPLESYS
        const text = new TextEncoder().encode(DB_HEADER_TEXT);
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
        this.view.setUint32(28, lastWord);
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

    protected encodeFile(id: number, buffer: ArrayBuffer, duration: number, frames: number): ArrayBuffer {
        // Remove all id3 frames
        const stripped = removeId3(buffer);
        // const converted = mple_build_conv_array(isEsys, stripped)
        // const encoded = new Uint8Array(HEADER_SIZE + converted.byteLength);
        const encoded = new Uint8Array(HEADER_SIZE + stripped.byteLength);
        const view = new DataView(encoded.buffer);

        // Header
        // 4 bytes - WMMP
        const text = new TextEncoder().encode(TRACK_HEADER_TEXT);
        encoded.set(text, 0);

        // 4 byte longword - total file size (bytes)
        view.setUint32(4, stripped.byteLength);
        // 4 byte longword - duration (ms)
        view.setUint32(8, duration);
        // 4 byte longword - frame count
        view.setUint32(12, frames);
        // 16 bytes - serial number + 0x01 and then padded with 0x00
        view.setUint32(16, this.serialNumber);
        view.setUint8(20, 1);
        view.setUint8(21, 0);
        view.setUint16(22, 0);
        view.setUint32(24, 0);
        view.setUint32(28, 0);

        // Encode
        // TODO
        // 145373760
        // 1000101010100011101001000000
        // 0000000000000000000001000000
        // 01000000
        // 10111111
        return stripped; // encoded.buffer;
    }

    protected createCypher(trackno: number): Uint8Array {
        const conv = new Uint8Array(256);
        /*
        The obfuscation mechanism is a trivial "substitution cypher" based on
        the track number. Start off with a 256-byte array (one for each
        possible byte value) and fill it with array[index] = 256 -
        index. Then, start working your way through powers of 2 from 1 up to
        the biggest power of 2 less than or equal to the track number. For
        each power N, if the track number has bit N set, go through your array
        in blocks of 2N, and swap the first N bytes of the block with the
        second N bytes. Here's the C code I've written to do this:
        */
        for (let i = 0; i < 256; i++) {
            conv[i] = 255 - i;
        }

        let bit = 1;
        while (bit <= trackno) {
            if (trackno & bit) {
                for (let j = 0; j < 256; j += bit * 2) {
                    for (let k = 0; k < bit; k++) {
                        const temp = conv[j + k];
                        conv[j + k] = conv[j + k + bit];
                        conv[j + k + bit] = temp;
                    }
                }
            }
            bit <<= 1;
        }

        /*
        Note that this array works for conversion in either
        direction. However, before it can be used, a further XOR must be
        applied to the conversion array; the entire array is xor'd with a
        bitflipped version of the last octet of the media serial number.
        */

        const flippedOctet = this.serialNumber & 0xff ^ 0xff;
        for (let i = 0; i < conv.byteLength; i++) {
            conv[i] ^= flippedOctet;
        }

        return conv;
    }

    protected stripId3(buffer: ArrayBuffer): ArrayBuffer {
        // TODO
        return buffer;
    }

    protected decodeFile(buffer: ArrayBuffer): ArrayBuffer {
        // TODO
        return buffer;
    }
}
