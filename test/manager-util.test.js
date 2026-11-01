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

const handleDataTransfer = (...handles) => ({
    files: [],
    items: handles.map(handle => ({
        getAsFileSystemHandle: async () => handle,
        webkitGetAsEntry: () => undefined
    }))
});

const expiringHandleDataTransfer = (...handles) => {
    let expired = false;
    const expireOnRead = handle => {
        if (handle.kind !== 'directory') {
            return handle;
        }
        return {
            ...handle,
            values: async function* () {
                expired = true;
                yield* handle.values();
            }
        };
    };

    return {
        files: [],
        items: handles.map(handle => ({
            getAsFileSystemHandle: async () => expired ? null : expireOnRead(handle),
            webkitGetAsEntry: () => undefined
        }))
    };
};

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

    it('orders dropped folder MP3 files using an M3U playlist in the same folder', async () => {
        const transfer = dataTransfer(directoryEntry('Album', [
            fileEntry('03 Third.mp3'),
            fileEntry('01 First.mp3'),
            fileEntry('02 Second.mp3'),
            fileEntry('album.m3u', new File(['02 Second.mp3\n01 First.mp3\n'], 'album.m3u', { type: 'audio/x-mpegurl' }))
        ]));

        const files = await getFiles(transfer);

        assert.deepEqual(files.map(({ file }) => file.name), [
            '02 Second.mp3',
            '01 First.mp3',
            '03 Third.mp3'
        ]);
    });

    it('orders dropped folder handles using an M3U8 playlist in the same folder', async () => {
        const transfer = handleDataTransfer(handleDirectory('Album', [
            handleFile('03 Third.mp3'),
            handleFile('01 First.mp3'),
            handleFile('02 Second.mp3'),
            handleFile('album.m3u8', new File(['#EXTM3U\n02 Second.mp3\n01 First.mp3\n'], 'album.m3u8', { type: 'audio/x-mpegurl' }))
        ]));

        const files = await getFiles(transfer);

        assert.deepEqual(files.map(({ file }) => file.name), [
            '02 Second.mp3',
            '01 First.mp3',
            '03 Third.mp3'
        ]);
    });

    it('reads multiple dropped folder handles as separate imported folders', async () => {
        const transfer = handleDataTransfer(
            handleDirectory('Album A', [
                handleFile('A2.mp3'),
                handleFile('A1.mp3'),
                handleFile('order.m3u', new File(['A1.mp3\nA2.mp3\n'], 'order.m3u', { type: 'audio/x-mpegurl' }))
            ]),
            handleDirectory('Album B', [
                handleFile('B1.mp3')
            ]),
            handleDirectory('Album C', [
                handleFile('C1.mp3')
            ])
        );

        const files = await getFiles(transfer);

        assert.deepEqual(files.map(({ file, folder }) => [folder, file.name]), [
            ['Album A', 'A1.mp3'],
            ['Album A', 'A2.mp3'],
            ['Album B', 'B1.mp3'],
            ['Album C', 'C1.mp3']
        ]);
    });

    it('requests all dropped folder handles before reading the first folder', async () => {
        const transfer = expiringHandleDataTransfer(
            handleDirectory('Album A', [handleFile('A1.mp3')]),
            handleDirectory('Album B', [handleFile('B1.mp3')]),
            handleDirectory('Album C', [handleFile('C1.mp3')])
        );

        const files = await getFiles(transfer);

        assert.deepEqual(files.map(({ file, folder }) => [folder, file.name]), [
            ['Album A', 'A1.mp3'],
            ['Album B', 'B1.mp3'],
            ['Album C', 'C1.mp3']
        ]);
    });
});
