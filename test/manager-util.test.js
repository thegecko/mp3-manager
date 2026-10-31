import assert from 'node:assert/strict';
import { getFiles } from '../src/manager/util.ts';

const fileEntry = (name, file = new File(['audio'], name, { type: 'audio/mpeg' })) => ({
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve) => resolve(file)
});

const directoryEntry = (name, entries) => ({
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
        let read = false;
        return {
            readEntries: (resolve) => {
                if (read) {
                    resolve([]);
                    return;
                }
                read = true;
                resolve(entries);
            }
        };
    }
});

const dataTransfer = (entry) => ({
    files: [],
    items: [{ webkitGetAsEntry: () => entry }]
});

const handleFile = (name, file = new File(['audio'], name, { type: 'audio/mpeg' })) => ({
    kind: 'file',
    name,
    getFile: async () => file
});

const handleDirectory = (name, handles) => ({
    kind: 'directory',
    name,
    async *values () {
        yield* handles;
    }
});

const handleDataTransfer = (handle) => ({
    files: [],
    items: [{
        getAsFileSystemHandle: async () => handle,
        webkitGetAsEntry: () => undefined
    }]
});

describe('manager util', () => {
    it('recursively reads MP3 files from dropped folders and groups by immediate parent folder', async () => {
        const transfer = dataTransfer(directoryEntry('Album', [
            fileEntry('Root Track.mp3'),
            fileEntry('cover.jpg', new File(['image'], 'cover.jpg', { type: 'image/jpeg' })),
            directoryEntry('Disc 1', [
                fileEntry('Track 01.mp3')
            ]),
            directoryEntry('Disc 2', [
                fileEntry('Track 02.mp3')
            ])
        ]));

        const files = await getFiles(transfer);

        assert.deepEqual(files.map(({ file, folder }) => [folder, file.name]), [
            ['Album', 'Root Track.mp3'],
            ['Disc 1', 'Track 01.mp3'],
            ['Disc 2', 'Track 02.mp3']
        ]);
    });

    it('prefers File System Access handles for dropped folders and groups by immediate parent folder', async () => {
        const transfer = handleDataTransfer(handleDirectory('Album', [
            handleFile('Root Track.mp3'),
            handleDirectory('Disc 1', [
                handleFile('Track 01.mp3')
            ]),
            handleDirectory('Disc 2', [
                handleFile('Track 02.mp3')
            ])
        ]));

        const files = await getFiles(transfer);

        assert.deepEqual(files.map(({ file, folder }) => [folder, file.name]), [
            ['Album', 'Root Track.mp3'],
            ['Disc 1', 'Track 01.mp3'],
            ['Disc 2', 'Track 02.mp3']
        ]);
    });
});
