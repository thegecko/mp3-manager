import assert from 'node:assert/strict';
import { addTags, deleteTags, readTags } from '../src/id3.ts';

describe('ID3 library', () => {
    it('writes and reads text tags', async () => {
        const mp3 = Uint8Array.from([0xff, 0xfb, 0x90, 0x64]);
        const tagged = addTags(mp3.buffer, {
            title: 'Song Title',
            artist: 'Artist Name',
            encodedBy: 'mp3manager'
        });

        const tags = await readTags(tagged);

        assert.equal(tags.title, 'Song Title');
        assert.equal(tags.artist, 'Artist Name');
        assert.equal(tags.encodedBy, 'mp3manager');
    });

    it('removes an ID3 tag without changing audio bytes', () => {
        const mp3 = Uint8Array.from([0xff, 0xfb, 0x90, 0x64]);
        const tagged = addTags(mp3.buffer, { title: 'Song Title' });
        const stripped = deleteTags(tagged);

        assert.deepEqual([...new Uint8Array(stripped)], [...mp3]);
    });

    it('returns no tags for buffers without an ID3 header', async () => {
        const tags = await readTags(Uint8Array.from([1, 2, 3, 4]).buffer);

        assert.deepEqual(tags, {});
    });
});
