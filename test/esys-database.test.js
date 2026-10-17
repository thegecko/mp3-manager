import assert from 'node:assert/strict';
import { addTags, deleteTags, readTags } from '../src/id3.ts';
import { detectDatabase } from '../src/database/database-detector.ts';
import { EsysDatabase, isEsys } from '../src/database/esys-database.ts';
import { createEsysFixture } from './helpers/esys.js';

describe('EsysDatabase', () => {
    const firstTrack = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3]);
    const secondTrack = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 4, 5, 6]);

    const createDatabase = async () => {
        const fileSystem = createEsysFixture([
            { id: 1, file: 'one.mp3', name: 'One', artist: 'Artist A', data: firstTrack },
            { id: 3, file: 'three.mp3', name: 'Three', artist: 'Artist B', data: secondTrack }
        ]);
        const database = await EsysDatabase.create(fileSystem);
        return { fileSystem, database };
    };

    it('detects ESYS folders', async () => {
        const fileSystem = createEsysFixture([]);

        assert.equal(await isEsys(fileSystem), true);
    });

    it('creates an empty PBLIST1.DAT initialisation file with the media serial number', async () => {
        const { database } = await createDatabase();
        const file = await database.createInitFile(createUsbDevice(createBootSectorResponse()));
        const data = await file.arrayBuffer();
        const view = new DataView(data);
        const text = new TextDecoder().decode(data.slice(0, 8));

        assert.equal(file.name, 'PBLIST1.DAT');
        assert.equal(text, 'WMPLESYS');
        assert.equal(view.getUint32(12), 0x11223344);
        assert.equal(view.getUint32(20), 0);
        assert.equal(view.getUint32(24), 0);

        let checksum = view.getUint32(0);
        for (let offset = 4; offset < 32; offset += 4) {
            checksum ^= view.getUint32(offset);
        }
        assert.equal(checksum, 0);
    });

    it('is selected by the database detector', async () => {
        const fileSystem = createEsysFixture([]);
        const database = await detectDatabase(fileSystem);

        assert.equal(database instanceof EsysDatabase, true);
    });

    it('reads folders and track metadata from PBLIST1.DAT', async () => {
        const { database } = await createDatabase();
        const folders = await database.getFolders();

        assert.equal(folders.length, 1);
        assert.equal(folders[0].name, 'Folder One');
        assert.deepEqual(folders[0].tracks.map(track => ({ id: track.id, file: track.file, name: track.name, artist: track.artist })), [
            { id: 1, file: 'one.mp3', name: 'One', artist: 'Artist A' },
            { id: 3, file: 'three.mp3', name: 'Three', artist: 'Artist B' }
        ]);
    });

    it('decodes MPDAT files and restores ID3 tags for download', async () => {
        const { database } = await createDatabase();
        await database.getFolders();

        const data = await database.readFile(1);
        assert.ok(data);

        const tags = await readTags(data);
        const stripped = deleteTags(data);

        assert.equal(tags.title, 'One');
        assert.equal(tags.artist, 'Artist A');
        assert.deepEqual([...new Uint8Array(stripped)], [...firstTrack]);
    });

    it('streams decoded MP3 files', async () => {
        const { database } = await createDatabase();
        await database.getFolders();

        const file = await database.streamFile(1);

        assert.ok(file);
        assert.equal(file.name, 'one.mp3');
        assert.equal(file.type, 'audio/mpeg');
    });

    it('reuses holes when allocating track ids', async () => {
        const { database } = await createDatabase();
        await database.getFolders();

        assert.equal(await database.getNextTrackId(), 2);
    });

    it('rewrites PBLIST1.DAT and keeps a backup', async () => {
        const { fileSystem, database } = await createDatabase();
        const folders = await database.getFolders();
        folders[0].name = 'Renamed Folder';

        assert.equal(await database.setFolders(folders), true);

        const nextFolders = await database.getFolders();
        const esys = await fileSystem.getDirectoryHandle('ESYS');
        const backup = await esys.getFileHandle('PBLIST0.DAT');

        assert.equal(nextFolders[0].name, 'Renamed Folder');
        assert.ok(await backup.getFile());
    });

    it('deletes encoded track files', async () => {
        const { fileSystem, database } = await createDatabase();
        const esys = await fileSystem.getDirectoryHandle('ESYS');
        const dataFolder = await esys.getDirectoryHandle('NW-MP3');

        assert.equal(await database.deleteFile(1), true);
        await assert.rejects(() => dataFolder.getFileHandle('MP0001.DAT'));
    });

    it('streams MP3 imports into encoded MPDAT files', async () => {
        const { database } = await createDatabase();
        const folders = await database.getFolders();
        const plain = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 7, 8, 9]);
        const tagged = addTags(plain.buffer, { title: 'Imported', artist: 'Import Artist' });
        const file = new File([tagged], 'imported.mp3', { type: 'audio/mpeg' });

        const track = await database.writeFile(2, file, 1000, 38);
        assert.deepEqual(track, {
            id: 2,
            file: 'imported.mp3',
            name: 'Imported',
            artist: 'Import Artist'
        });

        folders[0].tracks.push(track);
        assert.equal(await database.setFolders(folders), true);

        const data = await database.readFile(2);
        assert.ok(data);
        assert.deepEqual([...new Uint8Array(deleteTags(data))], [...plain]);
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

const createBootSectorResponse = () => length => {
    const data = new Uint8Array(length);
    const view = new DataView(data.buffer);
    view.setUint32(0x27, 0x11223344);
    return data;
};
