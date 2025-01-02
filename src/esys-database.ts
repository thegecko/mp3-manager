// https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT.txt

export interface Folder {
    name: string;
    offset: number;
}

export interface Track {
    file: string;
    title: string;
    artist: string;
}

const roundUp = (input: number, multiple = 8): number => input % multiple ? input + (multiple *2) - (input % multiple) : input;

export class EsysDatabase {

    protected view: DataView;
    protected folderCount: number;
    protected trackCount: number;

    public constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
        this.folderCount = this.view.getUint32(20);
        this.trackCount = this.view.getUint32(24);
    }

    public async getFolders(): Promise<Folder[]> {
        const folders: Folder[] = [];

        console.log(`folders: ${this.folderCount}, files: ${this.trackCount}`);
        for (let i = 0; i < this.folderCount; i++) {
            const start = 32 + (i * 256);
            const name = this.getText(start, 252);
            const offset = this.view.getUint32(start + 252);
            folders.push({ name, offset });
        }

        return folders;
    }

    public async getFiles(): Promise<number[]> {
        const files: number[] = [];
        const o = 32 + (this.folderCount * 256);
        for (let i = 0; i < this.trackCount; i++) {
            const start = o + (i * 2);
            const f = this.view.getUint16(start);
            files.push(f);
        }

        return files;
    }

    public async getTracks(): Promise<Track[]> {
        const tracks: Track[] = [];
        const o = 32 + (this.folderCount * 256) + roundUp(this.trackCount * 2);
        for (let i = 0; i < this.trackCount; i++) {
            const start = o + (i * 768);
            const file = this.getText(start, 256);
            const title = this.getText(start+256, 256);
            const artist = this.getText(start+512, 256);
            tracks.push({ file, title, artist });
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
