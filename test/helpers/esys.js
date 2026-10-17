import { MockDirectoryHandle } from './filesystem.js';

const HEADER_SIZE = 32;
const DB_HEADER_TEXT = 'WMPLESYS';
const TRACK_HEADER_TEXT = 'WMMP';

export const createEsysFixture = tracks => {
    const root = new MockDirectoryHandle('root');
    const esys = root.addDirectory('ESYS');
    const dataFolder = esys.addDirectory('NW-MP3');
    const serialNumber = 0x11223344;

    esys.addFile('PBLIST1.DAT', createPlaylist(serialNumber, tracks));
    for (const track of tracks) {
        dataFolder.addFile(getFilename(track.id), createTrackFile(serialNumber, track.id, track.data));
    }

    return root;
};

export const getFilename = id => `MP${id.toString(16).padStart(4, '0').toUpperCase()}.DAT`;

const createPlaylist = (serialNumber, tracks) => {
    const folderCount = 1;
    const trackCount = tracks.length;
    const fileOffset = HEADER_SIZE + (folderCount * 256);
    const trackOffset = fileOffset + roundUp(trackCount * 2);
    const data = new Uint8Array(trackOffset + (trackCount * 768));
    const view = new DataView(data.buffer);

    data.set(new TextEncoder().encode(DB_HEADER_TEXT), 0);
    view.setUint32(8, 0x12345678);
    view.setUint32(12, serialNumber);
    view.setUint32(16, 0x55667788);
    view.setUint32(20, folderCount);
    view.setUint32(24, trackCount);
    view.setUint32(28, headerChecksum(view));

    writeText(view, HEADER_SIZE, 252, 'Folder One');
    view.setUint32(HEADER_SIZE + 252, fileOffset);

    tracks.forEach((track, index) => {
        view.setUint16(fileOffset + (index * 2), track.id);
        const offset = trackOffset + (index * 768);
        writeText(view, offset, 256, track.file);
        writeText(view, offset + 256, 256, track.name);
        writeText(view, offset + 512, 256, track.artist);
    });

    return data;
};

const createTrackFile = (serialNumber, id, plain) => {
    const data = new Uint8Array(HEADER_SIZE + plain.byteLength);
    const view = new DataView(data.buffer);
    data.set(new TextEncoder().encode(TRACK_HEADER_TEXT), 0);
    view.setUint32(4, data.byteLength);
    view.setUint32(8, 1234);
    view.setUint32(12, 12);
    view.setUint32(16, serialNumber);
    view.setUint8(20, 1);

    const cypher = createCypher(serialNumber, id);
    for (let i = 0; i < plain.byteLength; i++) {
        data[HEADER_SIZE + i] = cypher[plain[i]];
    }
    return data;
};

const writeText = (view, offset, length, text) => {
    for (let i = 0; i < Math.min(text.length, Math.floor(length / 2) - 1); i++) {
        view.setUint16(offset + (i * 2), text.charCodeAt(i));
    }
};

const headerChecksum = view => {
    let checksum = view.getUint32(0);
    for (let offset = 4; offset < 28; offset += 4) {
        checksum ^= view.getUint32(offset);
    }
    return checksum;
};

const roundUp = (input, multiple = 16) => Math.ceil(input / multiple) * multiple;

const createCypher = (serialNumber, trackno) => {
    const conv = new Uint8Array(256);
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

    const flippedOctet = serialNumber & 0xff ^ 0xff;
    for (let i = 0; i < conv.byteLength; i++) {
        conv[i] ^= flippedOctet;
    }
    return conv;
};
