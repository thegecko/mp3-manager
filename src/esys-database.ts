/*
https://waider.ie/~waider/hacks/workshop/c/mple/FILE_FORMAT.txt

typedef struct {
  guint8  signature[8]; // "WMPLESYS", hence the name of the module 

  guint32 timestamp;    // ctime of the ESYS folder 
  guint32 msn;          // media serial number 
  guint32 magic;        // no idea what this is 

  guint32 folders;      // #folders 
  guint32 tracks;       // number of tracks on the device 

  // XORing the header 32 bits at a time should result in this
  //   checksum, or XORing including this should result in zero 
  guint32 checksum;     // XOR checksum 
} pblist_hdr;
*/

export interface Folder {
    name: string;
    offset: number;
}

export interface Track {
    id: number,
    name: string;
    folder?: string;
}

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
            let terminator = 0;
            for (let j = 0; j < 252; j++) {
                if (this.view.getUint16(start + j) === 0) {
                    terminator = j;
                    break;
                }
            }
            const bytes = this.view.buffer.slice(start, start + terminator);
            const name = new TextDecoder('UTF-16BE').decode(bytes).trim();
            const offset = this.view.getUint32(start + 252);
            folders.push({ name, offset });
        }

        return folders;
    }

    public async getFiles(): Promise<Track[]> {
        const files: number[] = [];
        const o = 32 + (this.folderCount * 256);
        for (let i = 0; i < this.trackCount; i++) {
            const start = o + (i * 2);
            const f = this.view.getUint16(start);
            //const t = this.view.getUint16(start+1);
            files.push(f);
        }

        console.log(files);
        return [{
            id: 1,
            name: `folders: ${this.folderCount}, files: ${this.trackCount}`
        }];
    }
}
