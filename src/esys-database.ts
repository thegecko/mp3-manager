// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT.txt

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

const roundUp = (input: number, multiple = 8): number => input % multiple ? input + (multiple * 2) - (input % multiple) : input;

export class EsysDatabase {

    protected view: DataView;
    protected folderCount: number;
    protected trackCount: number;
    protected fileOffset: number;
    protected trackOffset: number;

    public constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
        this.folderCount = this.view.getUint32(20);
        this.trackCount = this.view.getUint32(24);
        this.fileOffset = 32 + (this.folderCount * 256);
        this.trackOffset = 32 + (this.folderCount * 256) + roundUp(this.trackCount * 2);
    }

    public async getFolders(): Promise<Folder[]> {
        const folders: Folder[] = [];

        for (let i = 0; i < this.folderCount; i++) {
            const start = 32 + (i * 256);
            const name = this.getText(start, 252);
            const offset = this.view.getUint32(start + 252);
            folders.push({ name, offset, tracks: [] });
        }

        return folders;
    }

    public async getFoldersWithTracks(): Promise<Folder[]> {
        const folders = await this.getFolders();
        let lastOffset = this.trackCount;

        for (let i = this.folderCount - 1; i >= 0; i--) {
            const folder = folders[i];
            const from = (folder.offset - (32 + (folders.length * 256))) / 2;
            folder.tracks = await this.getTracks(from, lastOffset);
            lastOffset = from;
        }

        return folders;
    }

    public async getTracks(from = 0, to = this.trackCount): Promise<Track[]> {
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
