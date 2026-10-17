import { MockDirectoryHandle } from './filesystem.js';

const HEADER_SIZE = 36;
const DATA_OFFSET = 48;
const RECORD_SIZE = 0x290;
const TEXT_LENGTH = 0x80 - 6;

export const createOmgFixture = tracks => {
    const root = new MockDirectoryHandle('root');
    const omg = root.addDirectory('omgaudio');
    const maxId = Math.max(...tracks.map(track => track.id));
    const database = new Uint8Array(DATA_OFFSET + (maxId * RECORD_SIZE));
    const view = new DataView(database.buffer);
    const folders = new Map();

    database.set(new TextEncoder().encode('CNIF'), 0);
    database.set([1, 1, 0, 0], 4);
    view.setUint8(8, 1);
    database.set(new TextEncoder().encode('CNFB'), 16);
    view.setUint32(20, 32);
    view.setUint32(24, maxId * RECORD_SIZE + 16);
    database.set(new TextEncoder().encode('CNFB'), 32);
    view.setUint16(HEADER_SIZE, maxId);
    view.setUint16(HEADER_SIZE + 2, RECORD_SIZE);

    for (const track of tracks) {
        const offset = DATA_OFFSET + ((track.id - 1) * RECORD_SIZE);
        view.setUint16(offset + 12, 3);
        view.setUint16(offset + 14, 0x80);
        writeTag(database, view, offset + 16, 'TIT2', track.title);
        writeTag(database, view, offset + 16 + 0x80, 'TPE1', track.artist);
        writeTag(database, view, offset + 16 + (2 * 0x80), 'TALB', track.album);

        const folderName = getTitleFolderName(track.id).toLowerCase();
        let folder = folders.get(folderName);
        if (!folder) {
            folder = omg.addDirectory(folderName);
            folders.set(folderName, folder);
        }
        folder.addFile(getTitleFileName(track.id).toLowerCase(), track.data);
    }

    omg.addFile('04cntinf.dat', database);
    return root;
};

const getTitleFileName = id => `1${id.toString(16).padStart(7, '0').toUpperCase()}.OMA`;

const getTitleFolderName = id => `10F${Math.floor(id / 256).toString(16).padStart(2, '0').toUpperCase()}`;

const writeTag = (database, view, offset, tag, text) => {
    database.set(new TextEncoder().encode(tag), offset);
    view.setUint16(offset + 4, 2);
    writeText(view, offset + 6, TEXT_LENGTH, text);
};

const writeText = (view, offset, length, text) => {
    for (let i = 0; i < Math.min(text.length, Math.floor(length / 2) - 1); i++) {
        view.setUint16(offset + (i * 2), text.charCodeAt(i));
    }
};
