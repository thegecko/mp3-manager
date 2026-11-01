import assert from 'node:assert/strict';
import { addTags, deleteTags, readFileTags, readTags } from '../src/id3.ts';

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

    it('reads ID3v1 tags from the end of an MP3 file', async () => {
        const audio = Uint8Array.from([0xff, 0xfb, 0x90, 0x64]);
        const tagged = new Uint8Array(audio.byteLength + 128);
        tagged.set(audio);
        writeAscii(tagged, audio.byteLength, 'TAG', 3);
        writeAscii(tagged, audio.byteLength + 3, 'Bullets', 30);
        writeAscii(tagged, audio.byteLength + 33, 'Creed', 30);
        writeAscii(tagged, audio.byteLength + 63, 'Weathered', 30);
        writeAscii(tagged, audio.byteLength + 93, '2001', 4);
        tagged[audio.byteLength + 127] = 17;

        const tags = await readTags(tagged.buffer);

        assert.deepEqual(tags, {
            title: 'Bullets',
            artist: 'Creed',
            album: 'Weathered',
            year: '2001',
            genre: 'Rock'
        });
    });

    it('reads ID3v1 tags when only the front and tail of a large file are sampled', async () => {
        const audio = new Uint8Array((128 * 1024) + 256);
        audio.set([0xff, 0xfb, 0x90, 0x64]);
        const tagged = new Uint8Array(audio.byteLength + 128);
        tagged.set(audio);
        writeAscii(tagged, audio.byteLength, 'TAG', 3);
        writeAscii(tagged, audio.byteLength + 3, 'One Last Breath', 30);
        writeAscii(tagged, audio.byteLength + 33, 'Creed', 30);
        writeAscii(tagged, audio.byteLength + 63, 'Weathered', 30);
        tagged[audio.byteLength + 127] = 17;

        const tags = await readFileTags(new File([tagged], 'track.mp3', { type: 'audio/mpeg' }));

        assert.equal(tags.title, 'One Last Breath');
        assert.equal(tags.artist, 'Creed');
        assert.equal(tags.album, 'Weathered');
        assert.equal(tags.genre, 'Rock');
    });
});

const writeAscii = (buffer, offset, value, length) => {
    const bytes = new TextEncoder().encode(value.padEnd(length, ' '));
    buffer.set(bytes.subarray(0, length), offset);
};
