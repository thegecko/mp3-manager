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
        return { database };
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
                tracks: [{ id: 1, file: 'Artist A - One.oma', name: 'One', artist: 'Artist A' }]
            },
            {
                name: 'Album B',
                tracks: [{ id: 257, file: 'Artist B - Two.oma', name: 'Two', artist: 'Artist B' }]
            }
        ]);
    });

    it('streams OMA files from the title id path', async () => {
        const { database } = await createDatabase();
        await database.getFolders();

        const file = await database.streamFile(257);

        assert.ok(file);
        assert.equal(file.name, 'Artist B - Two.oma');
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
});

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
