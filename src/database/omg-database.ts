// MP3FileManager v2 - OmgAudio database format
// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT_v2.txt

// Supports
//  Generation 3 (NW-HD3, NW-HD5, NW-E10x/E2xx/E3xx/E4xx/E5xx)
//  Generation 4 (NW-A1000, NW-A1200, NW-A3000, NW-A60x)
//  Generation 5 (NW-E00x)
//  Generation 6 (NW-S20x)
//  Generation 7 (NW-E01x, NW-S60x/S70x, NW-S71x, NW-A80x, NW-A91x)
//  Vaio (VGF-AP1)?

import { addTags, readTags } from '../id3';
import { Database, Folder, Track } from './database-detector';
import { transferUsbStorageCommand } from '../usb-storage';
import { elapsed, log, warn } from '../log';

const ROOT_FOLDER = 'OMGAUDIO';
const DB_FILE = '04CNTINF.DAT';
const BACKUP_FOLDER = 'db_backup';
const FILE_HEADER_SIZE = 16;
const OBJECT_POINTER_SIZE = 16;
const OBJECT_HEADER_SIZE = 16;
const RECORD_HEADER_SIZE = 16;
const TITLE_RECORD_SIZE = 0x290;
const OMA_EXTENSION = 'OMA';
const MP3_EXTENSION = 'mp3';
const TABLE_MAGIC = 'CNIF';
const CONTENT_OBJECT_MAGIC = 'CNFB';

const TITLE_TAG = 'TIT2';
const ARTIST_TAG = 'TPE1';
const ALBUM_TAG = 'TALB';
const GENRE_TAG = 'TCON';
const LENGTH_TAG = 'TLEN';
const OMA_TAG_SIZE = 0x0c00;
const OMA_SECOND_HEADER_SIZE = 0x60;
const OMA_FILE_PROPERTIES = 0x0380d910;
const TREE_GPLB_OFFSET = 0x30;
const TREE_TPLB_OFFSET = 0x4040;
const TREE_GPLB_LENGTH = 0x4010;
const DEFAULT_GENRE = 'unknown genre';

interface OmgTrackInfo {
    duration: number;
    frames: number;
    genre: string;
    fileProperties: number;
}

interface OmgTrackEntry {
    id: number;
    name: string;
    artist: string;
    album: string;
    genre: string;
    duration: number;
    frames: number;
    fileProperties: number;
}

const QUERY_DVID_COMMAND = Uint8Array.from([
    0x55, 0x53, 0x42, 0x43, 0xB0, 0x0B, 0x9E, 0x81,
    0x12, 0x00, 0x00, 0x00, 0x80, 0x00, 0x0C, 0xA4,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xBC, 0x00,
    0x12, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x00
]);

// jsymphonic/src/main/java/org/naurd/media/jsymphonic/toolBox/DataBaseOmgaudioToolBox.java
// 00gtrlst.dat (only written, completely static) - write00GRTLST
// Write 01TREE22 and 03GINF22 files (only written, completely static) - write01TREE22and03GINF22

// Write 01TREE01 and 03GINF01 files (info about the titles) - write01TREE01and03GINF01 - folders paths
// Write 01TREE02 and 03GINF02 files (info about the artists) - write01TREE02and03GINF02 - artists
// Write 01TREE03 and 03GINF03 files (info about the albums) - write01TREE03and03GINF03 - folders
// Write 01TREE04 and 03GINF04 files (info about the genres) - write01TREE04and03GINF04 - genres
// Write 01TREE2D and 03GINF2D files (lookup tables for each file?) - write01TREE2Dand03GINF2D - artist and folders
// Write 02TREINF file (list of the keys) - write02TREINF - actually stores total length of all tracks in ms
// Write 04CNTINF file (list of the titles) - write04CNTINF - all the real stuff
// Write 04PATLST file (list of the paths) - write04PATLST - pretty sure this is unique to jsymphonic
// Write 05CIDLST file - write05CIDLST - looks like DRM keys

export const isOmg = async (fileSystem: FileSystemDirectoryHandle): Promise<boolean> => {
    // Check for OMGAUDIO folder
    try {
        await fileSystem.getDirectoryHandle(ROOT_FOLDER, { create: false });
    } catch (e) {
        try {
            await fileSystem.getDirectoryHandle(ROOT_FOLDER.toLowerCase(), { create: false });
        } catch (e) {
            // Directory not found
            return false;
        }
    }

    return true;
};

const normaliseUnknown = (value: string, fallback: string): string => value.length > 0 ? value : fallback;

const getTitleFileName = (id: number): string => `1${id.toString(16).padStart(7, '0').toUpperCase()}.${OMA_EXTENSION}`;

const getTitleFolderName = (id: number): string => `10F${Math.floor(id / 256).toString(16).padStart(2, '0').toUpperCase()}`;

const safeName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '-');

const getDirectoryHandle = async (folder: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> => {
    try {
        return await folder.getDirectoryHandle(name);
    } catch (e) {
        return folder.getDirectoryHandle(name.toLowerCase());
    }
};

const getFileHandle = async (folder: FileSystemDirectoryHandle, name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> => {
    try {
        return await folder.getFileHandle(name, options);
    } catch (e) {
        return folder.getFileHandle(name.toLowerCase(), options);
    }
};

export class OmgDatabase implements Database {

    public readonly type = 'OMG' as const;

    public async createInitFile(device: USBDevice): Promise<File> {
        const data = await transferUsbStorageCommand(device, QUERY_DVID_COMMAND, 18);
        const dvid = data.slice(12, 16);
        if (dvid.byteLength !== 4) {
            throw new Error('OMGAUDIO DvID data must be exactly 4 bytes');
        }

        const buffer = new Uint8Array(14);
        buffer.set(dvid, 10);

        return new File([buffer.buffer], 'DvID.dat');
    }

    public static async create(fileSystem: FileSystemDirectoryHandle): Promise<Database> {
        const start = performance.now();
        log('omg load: start', { root: fileSystem.name });
        if (!await isOmg(fileSystem)) {
            throw new Error('Invalid folder');
        }

        const rootFolder = await getDirectoryHandle(fileSystem, ROOT_FOLDER);
        log('omg load: opened OMGAUDIO folder', { name: rootFolder.name, elapsed: elapsed(start) });
        const dbHandle = await getFileHandle(rootFolder, DB_FILE);
        const dbFile = await dbHandle.getFile();
        const dbBuffer = await dbFile.arrayBuffer();
        log('omg load: read content database', { file: dbFile.name, bytes: dbFile.size, elapsed: elapsed(start) });
        const dvid = await readDvidFile(rootFolder);
        log('omg load: read DvID', { present: dvid !== undefined, elapsed: elapsed(start) });

        const database = new OmgDatabase(rootFolder, dbBuffer, dvid);
        log('omg load: complete', { trackCount: database.trackCount, elapsed: elapsed(start) });
        return database;
    }

    protected dbView: DataView;

    protected trackCount: number;
    protected dataLength: number;
    protected dataOffset: number;
    protected tracks = new Map<number, Track | undefined>;
    protected trackInfo = new Map<number, OmgTrackInfo>();
    protected reservedIds = new Set<number>();
    protected constructor(
        protected rootFolder: FileSystemDirectoryHandle,
        dbBuffer: ArrayBuffer,
        protected dvid?: number
    ) {
        this.dbView = new DataView(dbBuffer);
        this.checkHeader();
        const cnfbOffset = this.getObjectOffset(CONTENT_OBJECT_MAGIC);
        this.trackCount = this.dbView.getUint16(cnfbOffset + 4);
        this.dataLength = this.dbView.getUint16(cnfbOffset + 6) || TITLE_RECORD_SIZE;
        this.dataOffset = cnfbOffset + OBJECT_HEADER_SIZE;
    }

    public async getFolders(): Promise<Folder[]> {
        const start = performance.now();
        log('omg folders: scanning database', { trackCount: this.trackCount });
        const folders: Folder[] = [];
        const foldersByAlbum = new Map<string, Folder>();
        let emptySlots = 0;
        let missingFiles = 0;
        this.tracks.clear();

        for (let i = 0; i < this.trackCount; i++) {
            const offset = this.dataOffset + (i * this.dataLength);
            const id = i + 1;
            const tags = this.getContentTags(offset);
            const name = tags.get(TITLE_TAG) || '';
            const artist = tags.get(ARTIST_TAG) || '';
            const album = tags.get(ALBUM_TAG) || '';
            const field4 = this.dbView.getUint32(offset + 4);
            const field8 = this.dbView.getUint32(offset + 8);
            const usesFileProperties = field4 === OMA_FILE_PROPERTIES;
            const duration = usesFileProperties ? field8 : field4;
            const frames = usesFileProperties ? 0 : field8;
            const fileProperties = usesFileProperties ? field4 : OMA_FILE_PROPERTIES;
            const genre = tags.get(GENRE_TAG) || DEFAULT_GENRE;

            if (!name && !artist && !album) {
                emptySlots++;
                continue;
            }

            const fileHandle = await this.getTitleFileHandle(id);
            if (!fileHandle) {
                missingFiles++;
                continue;
            }

            const folderName = normaliseUnknown(album, 'Unknown Album');
            let folder = foldersByAlbum.get(folderName);
            if (!folder || folder.name !== folderName) {
                folder = {
                    id: -id,
                    name: folderName,
                    tracks: []
                };
                foldersByAlbum.set(folderName, folder);
                folders.push(folder);
            }

            const track = {
                id,
                file: `${safeName(normaliseUnknown(artist, 'Unknown Artist'))} - ${safeName(normaliseUnknown(name, 'Unknown Title'))}.${MP3_EXTENSION}`,
                name: normaliseUnknown(name, 'Unknown Title'),
                artist: normaliseUnknown(artist, 'Unknown Artist')
            };
            folder.tracks.push(track);
            this.tracks.set(id, track);
            this.trackInfo.set(id, { duration, frames, genre, fileProperties });
        }

        const tracks = folders.reduce((count, folder) => count + folder.tracks.length, 0);
        log('omg folders: scan complete', { folders: folders.length, tracks, emptySlots, missingFiles, elapsed: elapsed(start) });
        return folders;
    }

    public async setFolders(folders: Folder[]): Promise<boolean> {
        const start = performance.now();
        try {
            log('omg save: preparing database', { folders: folders.length });
            const tracks = folders.reduce((all, folder) => [...all, ...folder.tracks], [] as Track[]);
            const maxId = tracks.reduce((max, track) => Math.max(max, track.id), 0);
            this.trackCount = maxId;
            this.dataLength = TITLE_RECORD_SIZE;
            this.dataOffset = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE;
            this.dbView = new DataView(this.create04CNTINF(tracks, folders));
            const entries = this.createTrackEntries(tracks, folders);
            log('omg save: generated database buffers', { tracks: tracks.length, maxId, elapsed: elapsed(start) });

            for (const entry of entries) {
                try {
                    log('omg save: updating OMA metadata if needed', { id: entry.id, name: entry.name });
                    await this.updateOmaFileMetadata(entry);
                } catch (e) {
                    warn(`omg save: unable to update OMA metadata for track ${entry.id}`, e);
                }
            }

            await this.writeDatabaseFile(DB_FILE, this.dbView.buffer);
            await this.writeDatabaseFile('00gtrlst.dat', this.create00GTRLST());
            await this.writeDatabaseFile('01tree01.dat', this.create01TREE01(entries));
            await this.writeDatabaseFile('01tree02.dat', this.create01TREE02(entries));
            await this.writeDatabaseFile('01tree03.dat', this.create01TREE03(entries));
            await this.writeDatabaseFile('01tree04.dat', this.create01TREE04(entries));
            await this.writeDatabaseFile('01tree22.dat', this.createStaticTreeFile(0x10, 0x10));
            await this.writeDatabaseFile('01tree2D.dat', this.create01TREE2D(entries));
            await this.writeDatabaseFile('02treinf.dat', this.create02TREINF(entries));
            await this.writeDatabaseFile('03ginf01.dat', this.create03GINF01(entries));
            await this.writeDatabaseFile('03ginf02.dat', this.create03GINF02(entries));
            await this.writeDatabaseFile('03ginf03.dat', this.create03GINF03(entries));
            await this.writeDatabaseFile('03ginf04.dat', this.create03GINF04(entries));
            await this.writeDatabaseFile('03ginf22.dat', this.create03GINF22());
            await this.writeDatabaseFile('03ginf2D.dat', this.create03GINF2D(entries));
            await this.writeDatabaseFile('04patlst.dat', this.create04PATLST(maxId));
            await this.writeDatabaseFile('05cidlst.dat', this.createObjectFile('CIDL', 'CILB', maxId, 0x30));
            log('omg save: database files written', { elapsed: elapsed(start) });

            this.tracks.clear();
            for (const track of tracks) {
                this.tracks.set(track.id, track);
            }

            return true;
        } catch (e) {
            console.error('Failed to write OMGAUDIO database', e);
            throw e;
        }
    }

    public async getNextTrackId(): Promise<number> {
        let id = 1;
        while (this.tracks.has(id) || this.reservedIds.has(id)) {
            id++;
        }
        this.reservedIds.add(id);
        return id;
    }

    public async readFile(id: number): Promise<ArrayBuffer | undefined> {
        const file = await this.streamFile(id);
        return file?.arrayBuffer();
    }

    public async streamFile(id: number): Promise<File | undefined> {
        try {
            const fileHandle = await this.getTitleFileHandle(id);
            const file = await fileHandle?.getFile();
            const track = this.tracks.get(id);
            if (!file || !track) {
                return file;
            }

            const audioOffset = await this.getOmaAudioOffset(file);
            const stream = this.createOmaAudioStream(id, file.slice(audioOffset).stream(), file.size - audioOffset);
            const tagged = this.prependTags(stream, track);
            const blob = await new Response(tagged).blob();
            return new File([blob], track.file || `${track.name}.mp3`, { type: 'audio/mpeg' });
        } catch (e) {
            console.error(e);
        }
    }

    public async writeFile(id: number, file: File, duration: number, frames: number): Promise<Track | undefined> {
        const start = performance.now();
        try {
            log('omg upload: reading tags', { id, file: file.name, size: file.size });
            const tags = await readTags(await file.slice(0, 128 * 1024).arrayBuffer());
            const name = tags.title || 'unknown title';
            const artist = tags.artist || 'unknown artist';
            const genre = tags.genre || DEFAULT_GENRE;
            const track: Track = { id, name, artist, file: file.name || `${artist} - ${name}.mp3` };
            const tagSize = await this.getId3Size(file);
            log('omg upload: opening title folder', { id, tagSize, duration, frames, elapsed: elapsed(start) });
            const folder = await this.getTitleFolderHandle(id, true);
            const output = await getFileHandle(folder, getTitleFileName(id), { create: true });

            log('omg upload: writing OMA file', { id, folder: getTitleFolderName(id), file: getTitleFileName(id) });
            await this.writeOmaFile(output, file, tagSize, { ...track, genre, duration, frames });
            log('omg upload: OMA file written', { id, elapsed: elapsed(start) });
            this.tracks.set(id, track);
            this.trackInfo.set(id, { duration, frames, genre, fileProperties: OMA_FILE_PROPERTIES });
            this.reservedIds.delete(id);
            return track;
        } catch (e) {
            console.error(e);
        }
    }

    public async deleteFile(id: number): Promise<boolean> {
        try {
            const folder = await this.getTitleFolderHandle(id);
            try {
                await folder.removeEntry(getTitleFileName(id));
            } catch (e) {
                await folder.removeEntry(getTitleFileName(id).toLowerCase());
            }
            this.tracks.delete(id);
            this.trackInfo.delete(id);
            return true;
        } catch (e) {
            console.error(e);
        }

        return false;
    }

    protected checkHeader(): void {
        const buffer = this.dbView.buffer.slice(0, 4);
        const text = new TextDecoder().decode(buffer);
        if (text !== TABLE_MAGIC) {
            throw new Error('Invalid OMGAUDIO content database file');
        }
    }

    protected getObjectOffset(magic: string): number {
        const objectCount = this.dbView.getUint8(8);
        for (let i = 0; i < objectCount; i++) {
            const offset = FILE_HEADER_SIZE + (i * OBJECT_POINTER_SIZE);
            const objectMagic = this.getAscii(offset, 4);
            if (objectMagic === magic) {
                return this.dbView.getUint32(offset + 4);
            }
        }

        throw new Error(`Missing OMGAUDIO ${magic} object`);
    }

    protected getContentTags(offset: number): Map<string, string> {
        const tags = new Map<string, string>();
        const tagCount = this.dbView.getUint16(offset + 12);
        const tagLength = this.dbView.getUint16(offset + 14);
        if (tagCount === 0 || tagLength < 6) {
            return tags;
        }

        for (let i = 0; i < tagCount; i++) {
            const tagOffset = offset + RECORD_HEADER_SIZE + (i * tagLength);
            const tag = this.getAscii(tagOffset, 4);
            if (tag.charCodeAt(0) === 0) {
                continue;
            }
            tags.set(tag, this.getText(tagOffset + 6, tagLength - 6));
        }

        return tags;
    }

    protected getAscii(offset: number, length: number): string {
        const buffer = this.dbView.buffer.slice(offset, offset + length);
        return new TextDecoder().decode(buffer);
    }

    protected getText(offset: number, length: number): string {
        let terminator = length;

        for (let j = 0; j < length; j += 2) {
            if (this.dbView.getUint16(offset + j) === 0) {
                terminator = j;
                break;
            }
        }

        const bytes = this.dbView.buffer.slice(offset, offset + terminator);
        return new TextDecoder('UTF-16BE').decode(bytes).trim();
    }

    protected async getTitleFileHandle(id: number): Promise<FileSystemFileHandle | undefined> {
        try {
            const folder = await this.getTitleFolderHandle(id);
            return getFileHandle(folder, getTitleFileName(id));
        } catch (e) {
            console.error(e);
        }
    }

    protected async getTitleFolderHandle(id: number, create = false): Promise<FileSystemDirectoryHandle> {
        const name = getTitleFolderName(id);
        if (create) {
            try {
                return await getDirectoryHandle(this.rootFolder, name);
            } catch (e) {
                return this.rootFolder.getDirectoryHandle(name, { create: true });
            }
        }
        return getDirectoryHandle(this.rootFolder, name);
    }

    protected async writeOmaFile(fileHandle: FileSystemFileHandle, file: File, tagSize: number, data: Track & { genre: string, duration: number, frames: number }): Promise<void> {
        const start = performance.now();
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        log('omg upload: writable opened', { id: data.id, file: fileHandle.name });
        await writable.write(this.createOmaHeader(data));
        const reader = this.createOmaAudioStream(data.id, file.slice(tagSize).stream(), file.size - tagSize).getReader();
        let bytes = OMA_TAG_SIZE + OMA_SECOND_HEADER_SIZE;
        let chunks = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            await writable.write(value);
            bytes += value.byteLength;
            chunks++;
        }

        await writable.close();
        log('omg upload: writable closed', { id: data.id, bytes, chunks, elapsed: elapsed(start) });
    }

    protected async updateOmaFileMetadata(entry: OmgTrackEntry): Promise<void> {
        const fileHandle = await this.getTitleFileHandle(entry.id);
        const file = await fileHandle?.getFile();
        if (!file) {
            return;
        }

        const audioOffset = await this.getOmaAudioOffset(file);
        const headerLength = OMA_TAG_SIZE + OMA_SECOND_HEADER_SIZE;
        if (audioOffset !== headerLength) {
            return;
        }

        const current = new Uint8Array(await file.slice(0, headerLength).arrayBuffer());
        if (this.getOmaHeaderTag(current, TITLE_TAG) === entry.name
            && this.getOmaHeaderTag(current, ARTIST_TAG) === entry.artist
            && this.getOmaHeaderTag(current, GENRE_TAG) === entry.genre) {
            return;
        }

        const header = this.createOmaHeader(entry);
        const next = new Uint8Array(header);

        const writable = await fileHandle.createWritable({ keepExistingData: false });
        await writable.write(header);
        await writable.write(file.slice(audioOffset));
        await writable.close();
    }

    protected getOmaHeaderTag(header: Uint8Array, tag: string): string | undefined {
        const tagBytes = new TextEncoder().encode(tag);
        const offset = this.findBytes(header, tagBytes);
        if (offset < 0 || offset + 11 > header.byteLength) {
            return undefined;
        }

        const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
        const length = view.getUint32(offset + 4);
        const textLength = length - 1;
        const textOffset = offset + 11;
        if (length < 1 || textOffset + textLength > header.byteLength) {
            return undefined;
        }

        return new TextDecoder('UTF-16BE').decode(header.slice(textOffset, textOffset + textLength)).replace(/\0+$/, '');
    }

    protected findBytes(data: Uint8Array, pattern: Uint8Array): number {
        for (let index = 0; index <= data.byteLength - pattern.byteLength; index++) {
            if (pattern.every((byte, offset) => data[index + offset] === byte)) {
                return index;
            }
        }
        return -1;
    }

    protected createOmaHeader(track: Track & { genre: string, duration: number, frames: number }): ArrayBuffer {
        const first = new Uint8Array(OMA_TAG_SIZE);
        first.set([0x65, 0x61, 0x33, 0x03, 0, 0, 0, 0, 0x17, 0x76], 0);
        let offset = 10;
        offset = this.writeEa3Tag(first, offset, TITLE_TAG, track.name);
        offset = this.writeEa3Tag(first, offset, ARTIST_TAG, track.artist);
        offset = this.writeEa3Tag(first, offset, GENRE_TAG, track.genre);
        this.writeEa3Tag(first, offset, LENGTH_TAG, track.duration.toString());

        const second = new Uint8Array(OMA_SECOND_HEADER_SIZE);
        const view = new DataView(second.buffer);
        second.set(new TextEncoder().encode('EA3'), 0);
        second.set([0x02, 0x00, OMA_SECOND_HEADER_SIZE], 3);
        second.set([0xff, 0xff], 6);
        second[32] = 0x03;
        second[33] = 0x80;
        second[34] = 0xd9;
        second[35] = 0x10;
        view.setUint32(36, track.duration);
        view.setUint32(40, track.frames);

        const header = new Uint8Array(first.byteLength + second.byteLength);
        header.set(first, 0);
        header.set(second, first.byteLength);
        return header.buffer;
    }

    protected writeEa3Tag(buffer: Uint8Array, offset: number, tag: string, value: string): number {
        if (!value) {
            return offset;
        }
        const view = new DataView(buffer.buffer);
        buffer.set(new TextEncoder().encode(tag), offset);
        offset += 4;
        view.setUint32(offset, value.length * 2 + 1);
        offset += 4;
        buffer.set([0, 0, 2], offset);
        offset += 3;
        for (let i = 0; i < Math.min(value.length, 60); i++) {
            view.setUint16(offset + i * 2, value.charCodeAt(i));
        }
        return offset + value.length * 2;
    }

    protected async getOmaAudioOffset(file: File): Promise<number> {
        const firstHeader = new Uint8Array(await file.slice(0, 10).arrayBuffer());
        if (firstHeader[0] !== 0x65 || firstHeader[1] !== 0x61 || firstHeader[2] !== 0x33) {
            return 0;
        }
        const firstSize = 0x4000 * firstHeader[7] + 0x80 * firstHeader[8] + 0x80;
        const secondHeader = new Uint8Array(await file.slice(firstSize, firstSize + 6).arrayBuffer());
        if ((secondHeader[0] !== 0x45 && secondHeader[0] !== 0x65) || secondHeader[1] !== 0x41 || secondHeader[2] !== 0x33) {
            return firstSize;
        }
        const secondSize = (secondHeader[4] << 8) + secondHeader[5];
        return firstSize + secondSize;
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

    protected createOmaAudioStream(id: number, stream: ReadableStream<Uint8Array>, size: number): ReadableStream<Uint8Array> {
        if (this.dvid === undefined) {
            return stream;
        }

        const key = (0x2465 + id * 0x5296E435) ^ this.dvid;
        const keyBytes = new Uint8Array([(key >>> 24) & 0xff, (key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff]);
        const scrambleLength = size - (size % 8);
        let position = 0;

        return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                const transformed = new Uint8Array(chunk);
                for (let i = 0; i < transformed.byteLength; i++) {
                    if (position < scrambleLength) {
                        transformed[i] ^= keyBytes[position % 4];
                    }
                    position++;
                }
                controller.enqueue(transformed);
            }
        }));
    }

    protected async getId3Size(file: File): Promise<number> {
        const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
        if (header.length < 10 || header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) {
            return 0;
        }

        return 10 + ((header[6] << 21) + (header[7] << 14) + (header[8] << 7) + header[9]);
    }

    protected async writeDatabaseFile(name: string, data: ArrayBuffer): Promise<void> {
        const bytes = new Uint8Array(data);
        try {
            const existing = await this.getDatabaseFileHandle(name, false);
            const file = await existing.getFile();
            const current = new Uint8Array(await file.arrayBuffer());
            if (this.bytesEqual(current, bytes)) {
                return;
            }
        } catch (e) {
            // File does not exist yet; create it below.
        }

        const handle = await this.getDatabaseFileHandle(name, true);
        log('omg save: backing up database file', { name });
        await this.backupDatabaseFile(handle);
        log('omg save: writing database file', { name, bytes: data.byteLength });
        const writable = await handle.createWritable({ keepExistingData: false });
        await writable.write(data);
        await writable.close();
        log('omg save: wrote database file', { name });
    }

    protected async backupDatabaseFile(source: FileSystemFileHandle): Promise<void> {
        const name = source.name;
        let backupFolder: FileSystemDirectoryHandle;
        try {
            backupFolder = await this.rootFolder.getDirectoryHandle(BACKUP_FOLDER, { create: true });
        } catch (e) {
            throw new Error(`Unable to open OMGAUDIO backup folder ${BACKUP_FOLDER}: ${this.formatError(e)}`);
        }

        try {
            const file = await source.getFile();
            const target = await backupFolder.getFileHandle(name, { create: true });
            const writable = await target.createWritable({ keepExistingData: false });
            await writable.write(await file.arrayBuffer());
            await writable.close();
            log('omg save: backed up database file', { name, bytes: file.size });
        } catch (e) {
            throw new Error(`Unable to back up OMGAUDIO/${name}: ${this.formatError(e)}`);
        }
    }

    protected formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message || error.name;
        }
        return String(error);
    }

    protected async getDatabaseFileHandle(name: string, create: boolean): Promise<FileSystemFileHandle> {
        try {
            return await this.rootFolder.getFileHandle(name);
        } catch (e) { }

        const lower = name.toLowerCase();
        if (lower !== name) {
            try {
                return await this.rootFolder.getFileHandle(lower);
            } catch (e) { }
        }

        const upper = name.toUpperCase();
        if (upper !== name) {
            try {
                return await this.rootFolder.getFileHandle(upper);
            } catch (e) { }
        }

        return this.rootFolder.getFileHandle(name, { create });
    }

    protected bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
        if (left.byteLength !== right.byteLength) {
            return false;
        }
        for (let i = 0; i < left.byteLength; i++) {
            if (left[i] !== right[i]) {
                return false;
            }
        }
        return true;
    }

    protected create04CNTINF(tracks: Track[], folders: Folder[]): ArrayBuffer {
        const maxId = tracks.reduce((max, track) => Math.max(max, track.id), 0);
        const data = this.createObjectFile(TABLE_MAGIC, CONTENT_OBJECT_MAGIC, maxId, TITLE_RECORD_SIZE);
        const view = new DataView(data);
        for (const track of tracks) {
            const folder = folders.find(folder => folder.tracks.includes(track));
            const info = this.trackInfo.get(track.id) || { duration: 0, frames: 0, genre: DEFAULT_GENRE, fileProperties: OMA_FILE_PROPERTIES };
            const offset = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE + ((track.id - 1) * TITLE_RECORD_SIZE);
            view.setUint16(offset + 2, 0xffff);
            view.setUint32(offset + 4, info.fileProperties);
            view.setUint32(offset + 8, info.duration);
            view.setUint16(offset + 12, 5);
            view.setUint16(offset + 14, 0x80);
            this.writeTagRecord(data, offset + 16, TITLE_TAG, track.name);
            this.writeTagRecord(data, offset + 16 + 0x80, ARTIST_TAG, track.artist);
            this.writeTagRecord(data, offset + 16 + 0x100, ALBUM_TAG, folder?.name || 'Unknown Album');
            this.writeTagRecord(data, offset + 16 + 0x180, GENRE_TAG, info.genre);
            this.writeTagRecord(data, offset + 16 + 0x200, 'TSOP', '');
        }
        return data;
    }

    protected createTrackEntries(tracks: Track[], folders: Folder[]): OmgTrackEntry[] {
        return tracks.map(track => {
            const info = this.trackInfo.get(track.id) || { duration: 0, frames: 0, genre: DEFAULT_GENRE, fileProperties: OMA_FILE_PROPERTIES };
            return {
                id: track.id,
                name: track.name,
                artist: track.artist || 'unknown artist (JS)',
                album: folders.find(folder => folder.tracks.includes(track))?.name || 'unknown album (JS)',
                genre: info.genre || DEFAULT_GENRE,
                duration: info.duration,
                frames: info.frames,
                fileProperties: info.fileProperties
            };
        });
    }

    protected create00GTRLST(): ArrayBuffer {
        const sysb = this.createObject('SYSB', 1, 0x50, 0x70, 0xd0000000, 0);
        const gtlb = this.createObject('GTLB', 0x2d, 0x50, 0xe20, 6, 0x04000000);
        const view = new DataView(gtlb.buffer);
        const write = (index: number, fileRef: number, unknown: number, tags: string[], extra = ''): void => {
            const offset = OBJECT_HEADER_SIZE + index * 0x50;
            view.setUint16(offset, fileRef);
            view.setUint16(offset + 2, unknown);
            view.setUint16(offset + 16, tags.length);
            tags.forEach((tag, tagIndex) => gtlb.set(new TextEncoder().encode(tag), offset + 20 + tagIndex * 4));
            gtlb.set(new TextEncoder().encode(extra), offset + 48);
        };
        write(0, 1, 1, ['']);
        write(1, 2, 3, [ARTIST_TAG]);
        write(2, 3, 3, [ALBUM_TAG]);
        write(3, 4, 3, [GENRE_TAG]);
        write(4, 0x22, 2, []);
        write(5, 0x2d, 3, [ARTIST_TAG, ALBUM_TAG], 'TRNOTTCCTTCC');
        let index = 6;
        for (let fileRef = 5; fileRef <= 44; fileRef++) {
            if (fileRef !== 34) {
                write(index++, fileRef, 0, []);
            }
        }
        return this.createFileWithFixedObjects('GTLT', [
            { magic: 'SYSB', offset: 0x30, data: sysb },
            { magic: 'GTLB', offset: 0xa0, data: gtlb }
        ]);
    }

    protected create01TREE01(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.artist, entry => entry.album, entry => entry.name);
        return this.createGroupedTreeFile(sorted, entry => `${entry.artist}/${entry.album}`);
    }

    protected create01TREE02(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.artist, entry => entry.name);
        return this.createGroupedTreeFile(sorted, entry => entry.artist);
    }

    protected create01TREE03(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.album, entry => entry.name);
        return this.createGroupedTreeFile(sorted, entry => entry.album);
    }

    protected create01TREE04(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.genre, entry => entry.name);
        return this.createGroupedTreeFile(sorted, entry => entry.genre);
    }

    protected create01TREE2D(entries: OmgTrackEntry[]): ArrayBuffer {
        const { sorted, groups } = this.createArtistAlbumGroups(entries);
        return this.createTreeFile(sorted.map(entry => entry.id), groups);
    }

    protected create02TREINF(entries: OmgTrackEntry[]): ArrayBuffer {
        const data = this.createObjectFile('GTIF', 'GTFB', 0x2d, 0x90, 0x1f00);
        const view = new DataView(data);
        const total = entries.reduce((sum, entry) => sum + entry.duration, 0);
        const base = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE;
        for (let i = 0; i < 4; i++) {
            this.writeGPFBRecord(data, base + (i * 0x90), 0x90, total, '');
        }
        this.writeGPFBRecord(data, base + (0x21 * 0x90), 0x90, 0, '');
        this.writeGPFBRecord(data, base + (0x2c * 0x90), 0x90, total, 'STD_TPE1');
        return data;
    }

    protected create03GINF01(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.artist, entry => entry.album, entry => entry.name);
        const groups = this.groupEntries(sorted, entry => `${entry.artist}/${entry.album}`);
        return this.createGPIF(groups.map(group => this.createAlbumInfoRecord(group.key, group.name, group.items[0]?.artist || '', group.items[0]?.genre || DEFAULT_GENRE)), 0x310);
    }

    protected create03GINF02(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.artist, entry => entry.name);
        const groups = this.groupEntries(sorted, entry => entry.artist);
        return this.createGPIF(groups.map(group => this.createInfoRecord(group.key, group.name)), 0x90);
    }

    protected create03GINF03(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.album, entry => entry.name);
        const groups = this.groupEntries(sorted, entry => entry.album);
        return this.createGPIF(groups.map(group => this.createInfoRecord(0, group.name)), 0x90);
    }

    protected create03GINF04(entries: OmgTrackEntry[]): ArrayBuffer {
        const sorted = this.sortEntries(entries, entry => entry.genre, entry => entry.name);
        const groups = this.groupEntries(sorted, entry => entry.genre);
        return this.createGPIF(groups.map((group, index) => this.createInfoRecord(index + 1, group.name)), 0x90);
    }

    protected create03GINF22(): ArrayBuffer {
        return this.createGPIF([], 0x310);
    }

    protected create03GINF2D(entries: OmgTrackEntry[]): ArrayBuffer {
        const { records } = this.createArtistAlbumGroups(entries);
        return this.createGPIF(records, 0x110);
    }

    protected create04PATLST(maxId: number): ArrayBuffer {
        return this.createObjectFile('PALT', 'PATH', maxId, TITLE_RECORD_SIZE);
    }

    protected createGroupedTreeFile(entries: OmgTrackEntry[], getGroup: (entry: OmgTrackEntry) => string): ArrayBuffer {
        const groups = this.groupEntries(entries, getGroup).map((group, index) => ({ id: index + 1, first: group.first }));
        return this.createTreeFile(entries.map(entry => entry.id), groups);
    }

    protected createStaticTreeFile(gplbLength: number, tplbLength: number): ArrayBuffer {
        const gplb = this.createObject('GPLB', 0, 8, gplbLength, 0, 0);
        const tplb = this.createObject('TPLB', 0, 2, tplbLength, 0, 0);
        return this.createFileWithFixedObjects('TREE', [
            { magic: 'GPLB', offset: TREE_GPLB_OFFSET, data: gplb },
            { magic: 'TPLB', offset: TREE_GPLB_OFFSET + gplbLength, data: tplb }
        ]);
    }

    protected createTreeFile(ids: number[], groups: { id: number, first: number, kind?: number }[]): ArrayBuffer {
        const tplbLength = Math.ceil((OBJECT_HEADER_SIZE + ids.length * 2) / 16) * 16;
        const gplb = this.createObject('GPLB', groups.length, 8, TREE_GPLB_LENGTH, groups.length, 0);
        const gplbView = new DataView(gplb.buffer);
        groups.forEach((group, index) => {
            const offset = OBJECT_HEADER_SIZE + index * 8;
            gplbView.setUint16(offset, group.id);
            gplbView.setUint16(offset + 2, group.kind === 2 ? 0x0200 : 0x0100);
            gplbView.setUint16(offset + 4, group.first);
        });

        const tplb = this.createObject('TPLB', ids.length, 2, tplbLength, ids.length, 0);
        const tplbView = new DataView(tplb.buffer);
        ids.forEach((id, index) => tplbView.setUint16(OBJECT_HEADER_SIZE + index * 2, id));

        return this.createFileWithFixedObjects('TREE', [
            { magic: 'GPLB', offset: TREE_GPLB_OFFSET, data: gplb },
            { magic: 'TPLB', offset: TREE_TPLB_OFFSET, data: tplb }
        ]);
    }

    protected createGPIF(records: Uint8Array[], recordSize: number): ArrayBuffer {
        const data = this.createObjectFile('GPIF', 'GPFB', records.length, recordSize);
        const bytes = new Uint8Array(data);
        records.forEach((record, index) => bytes.set(record, FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE + index * recordSize));
        return data;
    }

    protected createInfoRecord(key: number, name: string): Uint8Array {
        const record = new Uint8Array(0x90);
        this.writeGPFBRecord(record.buffer, 0, 0x90, key, name);
        return record;
    }

    protected createAlbumInfoRecord(key: number, album: string, artist: string, genre: string): Uint8Array {
        const record = new Uint8Array(0x310);
        const view = new DataView(record.buffer);
        view.setUint32(8, key);
        view.setUint16(12, 6);
        view.setUint16(14, 0x80);
        this.writeTagRecord(record.buffer, 16, TITLE_TAG, album);
        this.writeTagRecord(record.buffer, 16 + 0x80, ARTIST_TAG, artist);
        this.writeTagRecord(record.buffer, 16 + 0x100, GENRE_TAG, genre);
        this.writeTagRecord(record.buffer, 16 + 0x180, 'TSOP', '');
        this.writeTagRecord(record.buffer, 16 + 0x200, 'PICP', '');
        this.writeTagRecord(record.buffer, 16 + 0x280, 'PIC0', '');
        return record;
    }

    protected createSortInfoRecord(key: number, value: string): Uint8Array {
        const record = new Uint8Array(0x110);
        const view = new DataView(record.buffer);
        view.setUint32(8, key);
        view.setUint16(12, 2);
        view.setUint16(14, 0x80);
        this.writeTagRecord(record.buffer, 16, TITLE_TAG, value);
        this.writeTagRecord(record.buffer, 16 + 0x80, 'XSOT', value);
        return record;
    }

    protected writeGPFBRecord(buffer: ArrayBuffer, offset: number, recordSize: number, key: number, name: string): void {
        const view = new DataView(buffer);
        view.setUint32(offset + 8, key);
        view.setUint16(offset + 12, 1);
        view.setUint16(offset + 14, 0x80);
        this.writeTagRecord(buffer, offset + 16, TITLE_TAG, name);
    }

    protected createArtistAlbumGroups(entries: OmgTrackEntry[]): { sorted: OmgTrackEntry[], groups: { id: number, first: number, kind?: number }[], records: Uint8Array[] } {
        const sorted = this.sortEntries(entries, entry => entry.artist, entry => entry.album, entry => entry.name);
        const artists: string[] = [];
        const albums: { artist: string, album: string, first: number, key: number }[] = [];
        const albumsPerArtist: number[] = [];
        let lastArtist = '';
        let lastAlbum = '';
        let albumCount = 0;

        sorted.forEach((entry, index) => {
            if (entry.album !== lastAlbum) {
                if (entry.artist !== lastArtist) {
                    artists.push(entry.artist);
                    if (albums.length > 0) {
                        albumsPerArtist.push(albumCount);
                    }
                    lastArtist = entry.artist;
                    albumCount = 0;
                }
                albums.push({ artist: entry.artist, album: entry.album, first: index + 1, key: entry.duration });
                lastAlbum = entry.album;
                albumCount++;
            } else {
                albums[albums.length - 1].key += entry.duration;
            }
        });
        if (albums.length > 0) {
            albumsPerArtist.push(albumCount);
        }

        const groups: { id: number, first: number, kind?: number }[] = [{ id: 1, first: 0 }];
        const records = [this.createSortInfoRecord(0, '')];
        let albumIndex = 0;
        artists.forEach((artist, artistIndex) => {
            groups.push({ id: artistIndex + albumIndex + 2, first: 0 });
            records.push(this.createSortInfoRecord(0, artist));
            for (let i = 0; i < albumsPerArtist[artistIndex]; i++) {
                const album = albums[albumIndex];
                groups.push({ id: artistIndex + albumIndex + 3, first: album.first, kind: 2 });
                records.push(this.createSortInfoRecord(album.key, album.album));
                albumIndex++;
            }
        });

        return { sorted, groups, records };
    }

    protected groupEntries(entries: OmgTrackEntry[], getGroup: (entry: OmgTrackEntry) => string): { name: string, first: number, key: number, items: OmgTrackEntry[] }[] {
        const groups: { name: string, first: number, key: number, items: OmgTrackEntry[] }[] = [];
        for (const entry of entries) {
            const name = getGroup(entry) || EMPTY_ARTIST_ALBUM_LABEL;
            const last = groups[groups.length - 1];
            if (!last || last.name !== name) {
                groups.push({ name, first: groups.reduce((count, group) => count + group.items.length, 0) + 1, key: entry.duration, items: [entry] });
            } else {
                last.key += entry.duration;
                last.items.push(entry);
            }
        }
        return groups;
    }

    protected sortEntries(entries: OmgTrackEntry[], ...getters: ((entry: OmgTrackEntry) => string)[]): OmgTrackEntry[] {
        return [...entries].sort((a, b) => {
            for (const getter of getters) {
                const result = getter(a).localeCompare(getter(b), undefined, { sensitivity: 'base' });
                if (result !== 0) {
                    return result;
                }
            }
            return a.id - b.id;
        });
    }

    protected createObject(magic: string, count: number, recordSize: number, objectSize = OBJECT_HEADER_SIZE + count * recordSize, complement1?: number, complement2?: number): Uint8Array {
        const object = new Uint8Array(objectSize);
        const view = new DataView(object.buffer);
        object.set(new TextEncoder().encode(magic), 0);
        view.setUint16(4, count);
        view.setUint16(6, recordSize);
        if (complement1 !== undefined) {
            view.setUint32(8, complement1);
        }
        if (complement2 !== undefined) {
            view.setUint32(12, complement2);
        }
        return object;
    }

    protected createObjectFile(fileMagic: string, objectMagic: string, count: number, recordSize: number, objectSize?: number): ArrayBuffer {
        const object = this.createObject(objectMagic, count, recordSize, objectSize);
        return this.createFileWithObjects(fileMagic, [{ magic: objectMagic, data: object }]);
    }

    protected createFileWithFixedObjects(fileMagic: string, objects: { magic: string, offset: number, data: Uint8Array }[]): ArrayBuffer {
        const size = objects.reduce((max, object) => Math.max(max, object.offset + object.data.byteLength), FILE_HEADER_SIZE + objects.length * OBJECT_POINTER_SIZE);
        const data = new Uint8Array(size);
        const view = new DataView(data.buffer);
        data.set(new TextEncoder().encode(fileMagic), 0);
        data.set([1, 1, 0, 0], 4);
        view.setUint8(8, objects.length);
        objects.forEach((object, index) => {
            const pointer = FILE_HEADER_SIZE + index * OBJECT_POINTER_SIZE;
            data.set(new TextEncoder().encode(object.magic), pointer);
            view.setUint32(pointer + 4, object.offset);
            view.setUint32(pointer + 8, object.data.byteLength);
            data.set(object.data, object.offset);
        });
        return data.buffer;
    }

    protected createFileWithObjects(fileMagic: string, objects: { magic: string, data: Uint8Array }[]): ArrayBuffer {
        const headerLength = FILE_HEADER_SIZE + (objects.length * OBJECT_POINTER_SIZE);
        const size = headerLength + objects.reduce((sum, object) => sum + object.data.byteLength, 0);
        const data = new Uint8Array(size);
        const view = new DataView(data.buffer);
        data.set(new TextEncoder().encode(fileMagic), 0);
        data.set([1, 1, 0, 0], 4);
        view.setUint8(8, objects.length);
        let offset = headerLength;
        objects.forEach((object, index) => {
            const pointer = FILE_HEADER_SIZE + index * OBJECT_POINTER_SIZE;
            data.set(new TextEncoder().encode(object.magic), pointer);
            view.setUint32(pointer + 4, offset);
            view.setUint32(pointer + 8, object.data.byteLength);
            data.set(object.data, offset);
            offset += object.data.byteLength;
        });
        return data.buffer;
    }

    protected writeTagRecord(buffer: ArrayBuffer, offset: number, tag: string, value: string): void {
        const data = new Uint8Array(buffer);
        const view = new DataView(buffer);
        data.set(new TextEncoder().encode(tag), offset);
        view.setUint16(offset + 4, 2);
        for (let i = 0; i < Math.min(value.length, 60); i++) {
            view.setUint16(offset + 6 + i * 2, value.charCodeAt(i));
        }
    }
}

const readDvidFile = async (rootFolder: FileSystemDirectoryHandle): Promise<number | undefined> => {
    try {
        const handle = await getFileHandle(rootFolder, 'DvID.dat');
        const file = await handle.getFile();
        const data = new Uint8Array(await file.slice(10, 14).arrayBuffer());
        if (data.byteLength !== 4) {
            return undefined;
        }
        return new DataView(data.buffer).getUint32(0);
    } catch (e) {
        return undefined;
    }
};
