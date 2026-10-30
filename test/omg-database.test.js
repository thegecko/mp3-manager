import assert from 'node:assert/strict';
import { addTags, deleteTags } from '../src/id3.ts';
import { detectDatabase } from '../src/database/database-detector.ts';
import { OmgDatabase, isOmg } from '../src/database/omg-database.ts';
import { createOmgFixture } from './helpers/omg.js';

describe('OmgDatabase', () => {
    const firstTrack = Uint8Array.from([1, 2, 3, 4]);
    const secondTrack = Uint8Array.from([5, 6, 7, 8]);

    const createDatabase = async () => {
        const fileSystem = createOmgFixture([
            { id: 1, title: 'One', artist: 'Artist A', album: 'Album A', data: firstTrack },
            { id: 257, title: 'Two', artist: 'Artist B', album: 'Album B', data: secondTrack }
        ]);
        const database = await OmgDatabase.create(fileSystem);
        return { database, fileSystem };
    };

    it('detects lowercase OMGAUDIO folders', async () => {
        const fileSystem = createOmgFixture([
            { id: 1, title: 'One', artist: 'Artist A', album: 'Album A', data: firstTrack }
        ]);

        assert.equal(await isOmg(fileSystem), true);
    });

    it('creates a DvID.dat file containing the USB DvID bytes at the jsymphonic offset', async () => {
        const { database } = await createDatabase();
        const file = await database.createInitFile(createUsbDevice(createDvidResponse()));
        const data = new Uint8Array(await file.arrayBuffer());

        assert.equal(file.name, 'DvID.dat');
        assert.equal(data.byteLength, 14);
        assert.deepEqual([...data.slice(0, 10)], new Array(10).fill(0));
        assert.deepEqual([...data.slice(10, 14)], [0x11, 0x22, 0x33, 0x44]);
    });

    it('is selected before ESYS by the database detector', async () => {
        const fileSystem = createOmgFixture([
            { id: 1, title: 'One', artist: 'Artist A', album: 'Album A', data: firstTrack }
        ]);
        const database = await detectDatabase(fileSystem);

        assert.equal(database instanceof OmgDatabase, true);
    });

    it('reads albums and tracks from 04CNTINF.DAT', async () => {
        const { database } = await createDatabase();
        const folders = await database.getFolders();

        assert.deepEqual(folders.map(folder => ({ name: folder.name, tracks: folder.tracks })), [
            {
                name: 'Album A',
                tracks: [{ id: 1, file: 'Artist A - One.mp3', name: 'One', artist: 'Artist A' }]
            },
            {
                name: 'Album B',
                tracks: [{ id: 257, file: 'Artist B - Two.mp3', name: 'Two', artist: 'Artist B' }]
            }
        ]);
    });

    it('streams OMA files from the title id path', async () => {
        const { database } = await createDatabase();
        await database.getFolders();

        const file = await database.streamFile(257);

        assert.ok(file);
        assert.equal(file.name, 'Artist B - Two.mp3');
        assert.equal(file.type, 'audio/mpeg');
        assert.deepEqual([...new Uint8Array(deleteTags(await file.arrayBuffer()))], [...secondTrack]);
    });

    it('reads OMA file bytes', async () => {
        const { database } = await createDatabase();

        const data = await database.readFile(1);

        assert.ok(data);
        assert.deepEqual([...new Uint8Array(data)], [...firstTrack]);
    });

    it('allocates ids, imports MP3 files, rewrites the database, and deletes OMA files', async () => {
        const { database } = await createDatabase();
        const folders = await database.getFolders();
        const plain = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 9, 10, 11]);
        const tagged = addTags(plain.buffer, { title: 'Imported', artist: 'Import Artist' });

        assert.equal(await database.getNextTrackId(), 2);

        const track = await database.writeFile(2, new File([tagged], 'imported.mp3', { type: 'audio/mpeg' }), 1000, 38);
        assert.deepEqual(track, {
            id: 2,
            file: 'imported.mp3',
            name: 'Imported',
            artist: 'Import Artist'
        });

        folders[0].tracks.push(track);
        assert.equal(await database.setFolders(folders), true);

        const reloaded = await database.getFolders();
        assert.equal(reloaded[0].tracks.some(track => track.id === 2 && track.name === 'Imported'), true);

        const exported = await database.streamFile(2);
        assert.ok(exported);
        assert.deepEqual([...new Uint8Array(deleteTags(await exported.arrayBuffer()))], [...plain]);

        assert.equal(await database.deleteFile(2), true);
    });

    it('rewrites OMGAUDIO index files in the padded JSymphonic-compatible shape', async () => {
        const { database, fileSystem } = await createDatabase();
        const folders = await database.getFolders();

        assert.equal(await database.setFolders(folders), true);

        const omg = fileSystem.entriesMap.get('omgaudio');
        const gtrlst = getFile(omg, '00gtrlst.dat').data;
        assert.equal(ascii(gtrlst, 0, 4), 'GTLT');
        assert.equal(gtrlst[8], 2);
        assert.equal(ascii(gtrlst, 16, 4), 'SYSB');
        assert.equal(ascii(gtrlst, 32, 4), 'GTLB');

        const tree = getFile(omg, '01tree01.dat').data;
        assert.equal(ascii(tree, 0, 4), 'TREE');
        assert.equal(read32(tree, 20), 0x30);
        assert.equal(read32(tree, 24), 0x4010);
        assert.equal(read32(tree, 36), 0x4040);
        assert.equal(ascii(tree, 0x30, 4), 'GPLB');
        assert.equal(ascii(tree, 0x4040, 4), 'TPLB');

        const ginf = getFile(omg, '03ginf02.dat').data;
        assert.equal(ascii(ginf, 0, 4), 'GPIF');
        assert.equal(read16(ginf, 48 + 12), 1);
        assert.equal(read16(ginf, 48 + 14), 0x80);
        assert.equal(ascii(ginf, 48 + 16, 4), 'TIT2');

        const cntinf = getFile(omg, '04CNTINF.DAT').data;
        assert.equal(read32(cntinf, 48 + 4), 0x0380d910);
        assert.equal(read16(cntinf, 48 + 12), 5);
        assert.equal(ascii(cntinf, 48 + 16 + 0x200, 4), 'TSOP');

        assert.ok(getFile(omg, '01tree22.dat'));
        assert.ok(getFile(omg, '01tree2D.dat'));
        assert.ok(getFile(omg, '03ginf22.dat'));
        assert.ok(getFile(omg, '03ginf2D.dat'));
        assert.ok(getFile(omg, '04patlst.dat'));
    });

    it('does not rewrite unchanged OMGAUDIO index files', async () => {
        const { database, fileSystem } = await createDatabase();
        const folders = await database.getFolders();
        await database.setFolders(folders);

        const omg = fileSystem.entriesMap.get('omgaudio');
        const writes = [];
        for (const [name, entry] of omg.entriesMap.entries()) {
            if (entry.kind === 'file') {
                const createWritable = entry.createWritable.bind(entry);
                entry.createWritable = async (...args) => {
                    writes.push(name);
                    return createWritable(...args);
                };
            }
        }

        await database.setFolders(folders);

        assert.deepEqual(writes, []);
    });

    it('backs up existing OMGAUDIO root files before rewriting the database', async () => {
        const { database, fileSystem } = await createDatabase();
        const folders = await database.getFolders();
        const omg = fileSystem.entriesMap.get('omgaudio');
        const original = getFile(omg, '04CNTINF.DAT').data.slice();
        const existingBackup = omg.addDirectory('db_backup');
        existingBackup.addFile('._03ginf03.dat', Uint8Array.from([1, 2, 3]));

        folders[0].name = 'Renamed Album';

        assert.equal(await database.setFolders(folders), true);

        const backup = await omg.getDirectoryHandle('db_backup');
        const backedUpDatabase = await backup.getFileHandle('04cntinf.dat');

        assert.deepEqual([...backedUpDatabase.data], [...original]);
        assert.equal(backup.entriesMap.has('10f00'), false);
        assert.equal(backup.entriesMap.has('10f01'), false);
        assert.equal(backup.entriesMap.has('._03ginf03.dat'), true);
    });

    it('updates the OMA file metadata header when a track is renamed', async () => {
        const { database, fileSystem } = await createDatabase();
        const folders = await database.getFolders();
        const plain = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 9, 10, 11]);
        const tagged = addTags(plain.buffer, { title: 'Original Title', artist: 'Import Artist' });
        const track = await database.writeFile(2, new File([tagged], 'imported.mp3', { type: 'audio/mpeg' }), 1000, 38);
        folders[0].tracks.push(track);
        await database.setFolders(folders);

        track.name = 'Renamed Title';

        assert.equal(await database.setFolders(folders), true);

        const omg = fileSystem.entriesMap.get('omgaudio');
        const folder = await omg.getDirectoryHandle('10f00');
        const file = await folder.getFileHandle('10000002.OMA');
        const header = file.data.slice(0, 0x0c60);

        assert.equal(hasUtf16Text(header, 'Renamed Title'), true);
        assert.equal(hasUtf16Text(header, 'Original Title'), false);

        const backup = await omg.getDirectoryHandle('db_backup');
        assert.equal(backup.entriesMap.has('10000002.OMA'), false);
        assert.equal(backup.entriesMap.has('10000002.oma'), false);
    });
});

const getFile = (folder, name) => folder.entriesMap.get(name) || folder.entriesMap.get(name.toLowerCase()) || folder.entriesMap.get(name.toUpperCase());
const ascii = (data, offset, length) => new TextDecoder().decode(data.slice(offset, offset + length));
const read16 = (data, offset) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(offset);
const read32 = (data, offset) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
const hasUtf16Text = (data, text) => {
    const encoded = new TextEncoder().encode([...text].map(char => `\0${char}`).join(''));
    return data.findIndex((_, index) => encoded.every((byte, offset) => data[index + offset] === byte)) >= 0;
};

const createUsbDevice = response => ({
    configuration: {
        interfaces: [{
            interfaceNumber: 0,
            alternates: [{
                alternateSetting: 0,
                endpoints: [
                    { type: 'bulk', direction: 'out', endpointNumber: 1 },
                    { type: 'bulk', direction: 'in', endpointNumber: 2 }
                ]
            }]
        }]
    },
    async open() { },
    async close() { },
    async claimInterface() { },
    async transferOut() { },
    async transferIn(endpoint, length) {
        return { data: new DataView(response(length).buffer) };
    }
});

const createDvidResponse = () => length => {
    const data = new Uint8Array(length);
    data.set([0x11, 0x22, 0x33, 0x44], 12);
    return data;
};
