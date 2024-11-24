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

export interface MusicFile {
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

    public async getFolders(): Promise<string[]> {
        const folders: string[] = [];

        console.log(`folders: ${this.folderCount}, files: ${this.trackCount}`);
        for (let i = 0; i < this.folderCount; i++) {
            const offset = 32 + (i * 256);
            let terminator = 0;
            for (let j = 0; j < 252; j++) {
                if (this.view.getUint16(offset + j) === 0) {
                    terminator = j;
                    break;
                }
            }
            const bytes = this.view.buffer.slice(offset, offset + terminator);
            const folder = new TextDecoder('UTF-16BE').decode(bytes).trim();
            folders.push(folder);
        }

        return folders;
    }

    public async getFiles(): Promise<MusicFile[]> {
        return [{
            id: 1,
            name: `folders: ${this.folderCount}, files: ${this.trackCount}`
        }];
    }
}
