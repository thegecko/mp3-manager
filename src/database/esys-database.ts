// MP3FileManager v1 - Esys database format
// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT.txt

// Supports
//  Generation 0 (NW-MSx, NW-Ex, NW-S4, NW-E8P, NW-MSxx, NW-HD1, NW-HD2)
//  Generation 1 (NW-Sxx, NW-Exx except NW-E99)
//  Generation 2 (NW-E99)

import { addTags, readTags } from '../id3';
import { Database, Folder, Track } from './database-detector';
import { transferUsbStorageCommand } from '../usb-storage';

const ROOT_FOLDER = 'ESYS';
const DATA_FOLDER = 'NW-MP3';
const DB_FILE = 'PBLIST1.DAT';
const BACKUP_FILE = 'PBLIST0.DAT';
const DB_HEADER_TEXT = 'WMPLESYS';
const TRACK_HEADER_TEXT = 'WMMP';
const HEADER_SIZE = 32;
const UNKNOWN_HEADER_OFFSET = 16;
const TAG_READ_SIZE = 128 * 1024;

const FAT_SERIAL_OFFSET = 0x27;
const READ_SECTOR_SIZE = 512;

const readFirstUsbStorageSector = async (device: USBDevice): Promise<Uint8Array> => {
    const tag = Date.now() & 0xffffffff;
    const cbw = new Uint8Array(31);
    const view = new DataView(cbw.buffer);

    view.setUint32(0, 0x43425355, true);
    view.setUint32(4, tag, true);
    view.setUint32(8, READ_SECTOR_SIZE, true);
    view.setUint8(12, 0x80);
    view.setUint8(14, 10);
    cbw[15] = 0x28;
    cbw[22] = 1;

    return transferUsbStorageCommand(device, cbw, READ_SECTOR_SIZE);
};

const createFatTimestamp = (date: Date): number => {
    const year = Math.max(1980, date.getFullYear()) - 1980;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    return (year << 25) | (month << 21) | (day << 16) | (hours << 11) | (minutes << 5) | seconds;
};

export const isEsys = async (fileSystem: FileSystemDirectoryHandle): Promise<boolean> => {
    // Check for ESYS folder
    try {
        await fileSystem.getDirectoryHandle(ROOT_FOLDER, { create: false });
    } catch (e) {
        // Directory not found
        return false;
    }

    return true;
};

// Round up to the nearest 16 bytes
const roundUp = (input: number, multiple = 16) => Math.ceil(input / multiple) * multiple;
const getFilename = (id: number) => `MP${id.toString(16).padStart(4, '0').toUpperCase()}.DAT`;

export class EsysDatabase implements Database {

    public readonly type = 'ESYS' as const;

    public async createInitFile(device: USBDevice): Promise<File> {
        const data = await readFirstUsbStorageSector(device);
        const serialNumber = readFatSerialNumber(data);
        const timestamp = createFatTimestamp(new Date());
        const buffer = new ArrayBuffer(HEADER_SIZE);
        const view = new DataView(buffer);
        const dataArray = new Uint8Array(buffer);

        dataArray.set(new TextEncoder().encode(DB_HEADER_TEXT), 0);
        view.setUint32(8, timestamp);
        view.setUint32(12, serialNumber);
        view.setUint32(UNKNOWN_HEADER_OFFSET, 0);
        view.setUint32(20, 0);
        view.setUint32(24, 0);

        let checksum = view.getUint32(0);
        for (let i = 4; i < 28; i += 4) {
            checksum ^= view.getUint32(i);
        }
        view.setUint32(28, checksum);

        return new File([buffer], DB_FILE);
    }

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
    protected unknownHeader: number;
    protected folderCount: number;
    protected trackCount: number;
    protected fileOffset: number;
    protected trackOffset: number;
    protected tracks = new Map<number, Track | undefined>;

    protected constructor(
        protected rootFolder: FileSystemDirectoryHandle,
        protected dataFolder: FileSystemDirectoryHandle,
        buffer: ArrayBuffer
    ) {
        this.view = new DataView(buffer);
        this.checkHeader();
        this.timestamp = this.view.getUint32(8);
        this.serialNumber = this.view.getUint32(12);
        this.unknownHeader = this.view.getUint32(UNKNOWN_HEADER_OFFSET);
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
            this.tracks.clear();
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
        let id: number | undefined;
        for (let i = 1; i <= this.tracks.size; i++) {
            if (!this.tracks.has(i)) {
                id = i;
                break;
            }
        }

        if (id === undefined) {
            id = this.tracks.size + 1;
        }

        this.tracks.set(id, undefined);
        return id;
    }

    public async readFile(id: number): Promise<ArrayBuffer | undefined> {
        const file = await this.streamFile(id);
        return file?.arrayBuffer();
    }

    public async streamFile(id: number): Promise<File | undefined> {
        try {
            const fileHandle = await this.dataFolder.getFileHandle(getFilename(id));
            const file = await fileHandle.getFile();
            const track = this.tracks.get(id);
            const stream = this.decodeStream(id, file);
            const tagged = track ? this.prependTags(stream, track) : stream;
            const blob = await new Response(tagged).blob();

            return new File([blob], track?.file || `${id}.mp3`, { type: 'audio/mpeg' });
        } catch (e) {
            console.error(e);
        }
    }

    public async writeFile(id: number, file: File, duration: number, frames: number): Promise<Track | undefined> {
        try {
            const tags = await readTags(await file.slice(0, TAG_READ_SIZE).arrayBuffer());
            const tagSize = await this.getId3Size(file);
            const fileHandle = await this.dataFolder.getFileHandle(getFilename(id), { create: true });
            await this.writeAudioFileHandle(fileHandle, id, file, tagSize, duration, frames);
            const name = tags.title || 'unknown title';
            const artist = tags.artist || 'unknown artist';
            return {
                id,
                name,
                artist,
                file: file.name || `${artist} - ${name}.mp3`
            };
        } catch (e) {
            console.error(e);
        }
    }

    public async deleteFile(id: number): Promise<boolean> {
        try {
            try {
                await this.dataFolder.removeEntry(getFilename(id));
            } catch (e) {
                await this.dataFolder.removeEntry(getFilename(id).toLowerCase());
            }
            return true;
        } catch (e) {
            console.error(e);
        }

        return false;
    }

    protected async writeAudioFileHandle(fileHandle: FileSystemFileHandle, id: number, file: File, tagSize: number, duration: number, frames: number): Promise<boolean> {
        try {
            const writable = await fileHandle.createWritable({ keepExistingData: false });
            await writable.write(this.createTrackHeader(file.size - tagSize, duration, frames));

            const reader = file
                .slice(tagSize)
                .stream()
                .pipeThrough(this.createCipherTransform(id))
                .getReader();

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                await writable.write(value);
            }

            await writable.close();
            return true;
        } catch (e) {
            console.error(e);
        }

        return false;
    }

    protected async writeFileHandle(fileHandle: FileSystemFileHandle, data: ArrayBuffer): Promise<boolean> {
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
        this.view.setUint32(UNKNOWN_HEADER_OFFSET, this.unknownHeader);
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

        this.updateTracks(tracks);
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

        this.tracks.clear();
        this.updateTracks(tracks);
    }

    protected updateTracks(tracks: Track[]): void {
        for (const track of tracks) {
            this.tracks.set(track.id, track);
        }
    }

    protected getText(offset: number, length: number): string {
        let terminator = 0;

        for (let j = 0; j < length; j += 2) {
            if (this.view.getUint16(offset + j) === 0) {
                terminator = j;
                break;
            }
        }

        const bytes = this.view.buffer.slice(offset, offset + terminator);
        return new TextDecoder('UTF-16BE').decode(bytes).trim();
    }

    protected setText(offset: number, text: string, length = 256): void {
        for (let i = 0; i < length; i += 2) {
            this.view.setUint16(offset + i, 0);
        }

        const maxLength = Math.floor(length / 2) - 1;
        for (let i = 0; i < Math.min(text.length, maxLength); i++) {
            this.view.setUint16(offset + (i * 2), text.charCodeAt(i));
        }
    }

    protected createTrackHeader(dataLength: number, duration: number, frames: number): ArrayBuffer {
        const encoded = new Uint8Array(HEADER_SIZE);
        const view = new DataView(encoded.buffer);

        // Add header
        // 4 bytes - WMMP
        const text = new TextEncoder().encode(TRACK_HEADER_TEXT);
        encoded.set(text, 0);

        // 4 byte longword - total file size (bytes)
        view.setUint32(4, HEADER_SIZE + dataLength);
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

        return encoded.buffer;
    }

    protected decodeStream(id: number, file: File): ReadableStream<Uint8Array> {
        return file
            .slice(HEADER_SIZE)
            .stream()
            .pipeThrough(this.createCipherTransform(id));
    }

    protected prependTags(stream: ReadableStream<Uint8Array>, track: Track): ReadableStream<Uint8Array> {
        const tag = new Uint8Array(addTags(new ArrayBuffer(0), {
            encodedBy: 'mp3manager',
            title: track.name,
            artist: track.artist
        }));

        return new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(tag);
                const reader = stream.getReader();

                const pump = (): Promise<void> => reader.read().then(({ value, done }) => {
                    if (done) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(value);
                    return pump();
                });

                return pump();
            }
        });
    }

    protected createCipherTransform(id: number): TransformStream<Uint8Array, Uint8Array> {
        const cypher = this.createCypher(id);
        return new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                const transformed = new Uint8Array(chunk.byteLength);
                for (let i = 0; i < chunk.byteLength; i++) {
                    transformed[i] = cypher[chunk[i]];
                }
                controller.enqueue(transformed);
            }
        });
    }

    protected async getId3Size(file: File): Promise<number> {
        const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
        if (header.length < 10 || header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) {
            return 0;
        }

        return 10 + (
            (header[6] << 21) +
            (header[7] << 14) +
            (header[8] << 7) +
            header[9]
        );
    }

    protected createCypher(trackno: number): Uint8Array {
        /*
        The obfuscation mechanism is a trivial "substitution cypher" based on
        the track number. Start off with a 256-byte array (one for each
        possible byte value) and fill it with array[index] = 256 -
        index.
        */
        const conv = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            conv[i] = 255 - i;
        }

        /*
        Then, start working your way through powers of 2 from 1 up to
        the biggest power of 2 less than or equal to the track number. For
        each power N, if the track number has bit N set, go through your array
        in blocks of 2N, and swap the first N bytes of the block with the
        second N bytes.
        */
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
}

const readFatSerialNumber = (sector: Uint8Array): number => {
    const view = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
    return view.getUint32(FAT_SERIAL_OFFSET);
};
