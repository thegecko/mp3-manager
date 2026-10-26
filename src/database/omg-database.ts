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

const ROOT_FOLDER = 'OMGAUDIO';
const DB_FILE = '04CNTINF.DAT';
const FILE_HEADER_SIZE = 16;
const OBJECT_POINTER_SIZE = 16;
const OBJECT_HEADER_SIZE = 16;
const RECORD_HEADER_SIZE = 16;
const TITLE_RECORD_SIZE = 0x290;
const OMA_EXTENSION = 'OMA';
const TABLE_MAGIC = 'CNIF';
const CONTENT_OBJECT_MAGIC = 'CNFB';

const TITLE_TAG = 'TIT2';
const ARTIST_TAG = 'TPE1';
const ALBUM_TAG = 'TALB';
const GENRE_TAG = 'TCON';
const LENGTH_TAG = 'TLEN';
const OMA_TAG_SIZE = 0x0c00;
const OMA_SECOND_HEADER_SIZE = 0x60;
const DEFAULT_GENRE = 'unknown genre';

interface OmgTrackInfo {
    duration: number;
    frames: number;
    genre: string;
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

    public readonly type = 'omg' as const;

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
        if (!isOmg(fileSystem)) {
            throw new Error('Invalid folder');
        }

        const rootFolder = await getDirectoryHandle(fileSystem, ROOT_FOLDER);
        const dbHandle = await getFileHandle(rootFolder, DB_FILE);
        const dbFile = await dbHandle.getFile();
        const dbBuffer = await dbFile.arrayBuffer();
        const dvid = await readDvidFile(rootFolder);

        return new OmgDatabase(rootFolder, dbBuffer, dvid);
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
        const folders: Folder[] = [];
        const foldersByAlbum = new Map<string, Folder>();
        this.tracks.clear();

        for (let i = 0; i < this.trackCount; i++) {
            const offset = this.dataOffset + (i * this.dataLength);
            const id = i + 1;
            const tags = this.getContentTags(offset);
            const name = tags.get(TITLE_TAG) || '';
            const artist = tags.get(ARTIST_TAG) || '';
            const album = tags.get(ALBUM_TAG) || '';
            const duration = this.dbView.getUint32(offset + 4);
            const frames = this.dbView.getUint32(offset + 8);
            const genre = tags.get(GENRE_TAG) || DEFAULT_GENRE;

            if (!name && !artist && !album) {
                continue;
            }

            const fileHandle = await this.getTitleFileHandle(id);
            if (!fileHandle) {
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
                file: `${safeName(normaliseUnknown(artist, 'Unknown Artist'))} - ${safeName(normaliseUnknown(name, 'Unknown Title'))}.${OMA_EXTENSION.toLowerCase()}`,
                name: normaliseUnknown(name, 'Unknown Title'),
                artist: normaliseUnknown(artist, 'Unknown Artist')
            };
            folder.tracks.push(track);
            this.tracks.set(id, track);
            this.trackInfo.set(id, { duration, frames, genre });
        }

        return folders;
    }

    public async setFolders(folders: Folder[]): Promise<boolean> {
        try {
            const tracks = folders.reduce((all, folder) => [...all, ...folder.tracks], [] as Track[]);
            const maxId = tracks.reduce((max, track) => Math.max(max, track.id), 0);
            this.trackCount = maxId;
            this.dataLength = TITLE_RECORD_SIZE;
            this.dataOffset = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE;
            this.dbView = new DataView(this.create04CNTINF(tracks, folders));

            await this.writeDatabaseFile(DB_FILE, this.dbView.buffer);
            await this.writeDatabaseFile('00GTRLST.DAT', this.createObjectFile('GTLT', 'GTLB', 0, 0x50));
            await this.writeDatabaseFile('01TREE01.DAT', this.createTreeFile(tracks));
            await this.writeDatabaseFile('01TREE02.DAT', this.createGroupedTreeFile(tracks, track => track.artist || 'Unknown Artist'));
            await this.writeDatabaseFile('01TREE03.DAT', this.createGroupedTreeFile(tracks, track => folders.find(folder => folder.tracks.includes(track))?.name || 'Unknown Album'));
            await this.writeDatabaseFile('01TREE04.DAT', this.createGroupedTreeFile(tracks, track => this.trackInfo.get(track.id)?.genre || DEFAULT_GENRE));
            await this.writeDatabaseFile('02TREINF.DAT', this.create02TREINF(tracks));
            await this.writeDatabaseFile('03GINF01.DAT', this.createGroupedInfoFile(folders.map(folder => folder.name)));
            await this.writeDatabaseFile('03GINF02.DAT', this.createGroupedInfoFile([...new Set(tracks.map(track => track.artist || 'Unknown Artist'))]));
            await this.writeDatabaseFile('03GINF03.DAT', this.createGroupedInfoFile(folders.map(folder => folder.name)));
            await this.writeDatabaseFile('03GINF04.DAT', this.createGroupedInfoFile([...new Set(tracks.map(track => this.trackInfo.get(track.id)?.genre || DEFAULT_GENRE))]));
            await this.writeDatabaseFile('05CIDLST.DAT', this.createObjectFile('CIDL', 'CILB', maxId, 0x30));

            this.tracks.clear();
            for (const track of tracks) {
                this.tracks.set(track.id, track);
            }

            return true;
        } catch (e) {
            console.error(e);
        }

        return false;
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
        try {
            const tags = await readTags(await file.slice(0, 128 * 1024).arrayBuffer());
            const name = tags.title || 'unknown title';
            const artist = tags.artist || 'unknown artist';
            const genre = tags.genre || DEFAULT_GENRE;
            const track: Track = { id, name, artist, file: file.name || `${artist} - ${name}.mp3` };
            const tagSize = await this.getId3Size(file);
            const folder = await this.getTitleFolderHandle(id, true);
            const output = await getFileHandle(folder, getTitleFileName(id), { create: true });

            await this.writeOmaFile(output, file, tagSize, { ...track, genre, duration, frames });
            this.tracks.set(id, track);
            this.trackInfo.set(id, { duration, frames, genre });
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
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        await writable.write(this.createOmaHeader(data));
        const reader = this.createOmaAudioStream(data.id, file.slice(tagSize).stream(), file.size - tagSize).getReader();

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            await writable.write(value);
        }

        await writable.close();
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
        const handle = await getFileHandle(this.rootFolder, name, { create: true });
        const writable = await handle.createWritable({ keepExistingData: false });
        await writable.write(data);
        await writable.close();
    }

    protected create04CNTINF(tracks: Track[], folders: Folder[]): ArrayBuffer {
        const maxId = tracks.reduce((max, track) => Math.max(max, track.id), 0);
        const data = this.createObjectFile(TABLE_MAGIC, CONTENT_OBJECT_MAGIC, maxId, TITLE_RECORD_SIZE);
        const view = new DataView(data);
        for (const track of tracks) {
            const folder = folders.find(folder => folder.tracks.includes(track));
            const info = this.trackInfo.get(track.id) || { duration: 0, frames: 0, genre: DEFAULT_GENRE };
            const offset = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE + ((track.id - 1) * TITLE_RECORD_SIZE);
            view.setUint16(offset + 2, 0xffff);
            view.setUint32(offset + 4, info.duration);
            view.setUint32(offset + 8, info.frames);
            view.setUint16(offset + 12, 4);
            view.setUint16(offset + 14, 0x80);
            this.writeTagRecord(data, offset + 16, TITLE_TAG, track.name);
            this.writeTagRecord(data, offset + 16 + 0x80, ARTIST_TAG, track.artist);
            this.writeTagRecord(data, offset + 16 + 0x100, ALBUM_TAG, folder?.name || 'Unknown Album');
            this.writeTagRecord(data, offset + 16 + 0x180, GENRE_TAG, info.genre);
        }
        return data;
    }

    protected create02TREINF(tracks: Track[]): ArrayBuffer {
        const data = this.createObjectFile('GTIF', 'GTFB', 0x2d, 0x90);
        const view = new DataView(data);
        const total = tracks.reduce((sum, track) => sum + (this.trackInfo.get(track.id)?.duration || 0), 0);
        const base = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE;
        for (let i = 0; i < 4; i++) {
            view.setUint32(base + (i * 0x90), total);
        }
        return data;
    }

    protected createTreeFile(tracks: Track[]): ArrayBuffer {
        return this.createTreeObjects(tracks.map(track => track.id), [{ id: 1, first: 1 }]);
    }

    protected createGroupedTreeFile(tracks: Track[], getGroup: (track: Track) => string): ArrayBuffer {
        const ids: number[] = [];
        const groups: { id: number, first: number }[] = [];
        let lastGroup = '';
        let groupId = 1;
        for (const track of tracks) {
            const group = getGroup(track);
            if (group !== lastGroup) {
                groups.push({ id: groupId++, first: ids.length + 1 });
                lastGroup = group;
            }
            ids.push(track.id);
        }
        return this.createTreeObjects(ids, groups);
    }

    protected createTreeObjects(ids: number[], groups: { id: number, first: number }[]): ArrayBuffer {
        const gplb = new Uint8Array(OBJECT_HEADER_SIZE + groups.length * 8);
        const gplbView = new DataView(gplb.buffer);
        gplb.set(new TextEncoder().encode('GPLB'), 0);
        gplbView.setUint16(4, groups.length);
        gplbView.setUint16(6, 8);
        groups.forEach((group, index) => {
            const offset = OBJECT_HEADER_SIZE + index * 8;
            gplbView.setUint16(offset, group.id);
            gplbView.setUint16(offset + 2, 0x0100);
            gplbView.setUint16(offset + 4, group.first);
        });
        const tplb = new Uint8Array(OBJECT_HEADER_SIZE + ids.length * 2);
        const tplbView = new DataView(tplb.buffer);
        tplb.set(new TextEncoder().encode('TPLB'), 0);
        tplbView.setUint16(4, ids.length);
        tplbView.setUint16(6, 2);
        ids.forEach((id, index) => tplbView.setUint16(OBJECT_HEADER_SIZE + index * 2, id));
        return this.createFileWithObjects('TREE', [{ magic: 'GPLB', data: gplb }, { magic: 'TPLB', data: tplb }]);
    }

    protected createGroupedInfoFile(names: string[]): ArrayBuffer {
        const data = this.createObjectFile('GPIF', 'GPFB', names.length, 0x90);
        names.forEach((name, index) => {
            const offset = FILE_HEADER_SIZE + OBJECT_POINTER_SIZE + OBJECT_HEADER_SIZE + index * 0x90;
            this.writeTagRecord(data, offset + 16, TITLE_TAG, name);
        });
        return data;
    }

    protected createObjectFile(fileMagic: string, objectMagic: string, count: number, recordSize: number): ArrayBuffer {
        const object = new Uint8Array(OBJECT_HEADER_SIZE + count * recordSize);
        const view = new DataView(object.buffer);
        object.set(new TextEncoder().encode(objectMagic), 0);
        view.setUint16(4, count);
        view.setUint16(6, recordSize);
        return this.createFileWithObjects(fileMagic, [{ magic: objectMagic, data: object }]);
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
