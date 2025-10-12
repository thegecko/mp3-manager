// MP3FileManager v2 - OmgAudio database format (not implemented)
// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT_v2.txt

// Supports
//  Generation 3 (NW-HD3, NW-HD5, NW-E10x/E2xx/E3xx/E4xx/E5xx)
//  Generation 4 (NW-A1000, NW-A1200, NW-A3000, NW-A60x)
//  Generation 5 (NW-E00x)
//  Generation 6 (NW-S20x)
//  Generation 7 (NW-E01x, NW-S60x/S70x, NW-S71x, NW-A80x, NW-A91x)
//  Vaio (VGF-AP1)?

import { Database, Folder, Track } from './database-detector';

const ROOT_FOLDER = 'OMGAUDIO';
const DATA_FOLDER = '10F00';
const DB_FILE = '04CNTINF.DAT';
const HEADER_SIZE = 36;
// const DATA_OFFSET = HEADER_SIZE + ;

// jsymphonic/src/main/java/org/naurd/media/jsymphonic/toolBox/DataBaseOmgaudioToolBox.java
// 00gtrlst.dat (only written, completely static) - write00GRTLST
// Write 01TREE22 and 03GINF22 files (only written, completely static) - write01TREE22and03GINF22

// Write 01TREE01 and 03GINF01 files (info about the titles) - write01TREE01and03GINF01
// Write 01TREE02 and 03GINF02 files (info about the artists) - write01TREE02and03GINF02
// Write 01TREE03 and 03GINF03 files (info about the albums) - write01TREE03and03GINF03
// Write 01TREE04 and 03GINF04 files (info about the genres) - write01TREE04and03GINF04
// Write 01TREE2D and 03GINF2D files (lookup tables for each file?) - write01TREE2Dand03GINF2D
// Write 02TREINF file (list of the keys) - write02TREINF - actually stores total length of all tracks in ms
// Write 04CNTINF file (list of the titles) - write04CNTINF - all the real stufs
// Write 04PATLST file (list of the paths) - write04PATLST - pretty sure this is unique to jsymphonic
// Write 05CIDLST file - write05CIDLST - looks like DRM keys

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

        const rootFolder = await fileSystem.getDirectoryHandle(ROOT_FOLDER);
        const dataFolder = await rootFolder.getDirectoryHandle(DATA_FOLDER);
        const dbHandle = await rootFolder.getFileHandle(DB_FILE);
        const dbFile = await dbHandle.getFile();
        const buffer = await dbFile.arrayBuffer();

        return new OmgDatabase(dataFolder, buffer);
    }

    protected view: DataView;
    protected trackCount: number;
    protected dataLength: number;
    protected tracks = new Map<number, Track | undefined>;

    protected constructor(
        protected dataFolder: FileSystemDirectoryHandle,
        buffer: ArrayBuffer
    ) {
        this.view = new DataView(buffer);
        this.trackCount = this.view.getUint16(HEADER_SIZE);
        this.dataLength = this.view.getUint16(HEADER_SIZE+2);
    }

    public async getFolders(): Promise<Folder[]> {
        let folders: Folder[] = [];
        let folder: Partial<Folder> | undefined;

        for (let i = 0; i < this.trackCount; i++) {
            let offset = 48 + (i * this.dataLength);
            const id = this.view.getUint32(offset + 8);
            const name = this.getText(offset + 22, 122);
            const artist = this.getText(offset + 150, 122);
            const album = this.getText(offset + 278, 122);
           
            if (!folder || album !== folder.name) {
                if (folder) {
                    folders.push(folder as Folder);
                }
                folder = {
                    id: i,
                    name: album,
                    tracks: []
                }
            }

            (folder as Folder).tracks.push({ id, file: 'file', name, artist });
        }

        folders.push(folder as Folder);
        return folders;
    }

    public setFolders(folders: Folder[]): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    public getNextTrackId(): Promise<number> {
        throw new Error('Method not implemented.');
    }

    public readFile(id: number): Promise<ArrayBuffer | undefined> {
        throw new Error('Method not implemented.');
    }

    public writeFile(id: number, data: ArrayBuffer, duration: number, frames: number, fileName?: string): Promise<Track | undefined> {
        throw new Error('Method not implemented.');
    }

    public deleteFile(id: number): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    protected getText(offset: number, length: number): string {
        let terminator = 0;

        for (let j = 0; j < length; j++) {
            if (this.view.getUint16(offset + j) === 0) {
                terminator = j;
                break;
            }
        }

        const bytes = this.view.buffer.slice(offset, offset + terminator);
        return new TextDecoder('UTF-16BE').decode(bytes).trim();
    }
}
