// Small ID3 library to manage text ID3 tags
// Based on https://github.com/Zazama/node-id3

export const readTags = async (buffer: ArrayBuffer): Promise<{ [key: string]: string }> => {
    const tags = getTagsFromBuffer(new Uint8Array(buffer));
    return tags;
};

export const deleteTags = (buffer: ArrayBuffer): ArrayBuffer => {
    return removeTagsFromBuffer(new Uint8Array(buffer)).buffer;
};

export const addTags = (buffer: ArrayBuffer, tags: { [key: string]: string }): ArrayBuffer => {
    const frontValues = createTags(tags);
    const backValues = new Uint8Array(buffer);
    const mergedArray = new Uint8Array(frontValues.length + backValues.length);
    mergedArray.set(frontValues);
    mergedArray.set(backValues, frontValues.length);
    return mergedArray;
};

const getTagsFromBuffer = (buffer: Uint8Array): { [key: string]: string } => {
    const tags: { [key: string]: string } = {}

    const framePosition = getFramePosition(buffer);
    if (framePosition === -1) {
        return tags;
    }

    const frameSize = decodeSize(buffer.slice(framePosition + 6, framePosition + 10)) + 10;
    const ID3Frame = new Uint8Array(frameSize + 1);
    ID3Frame.set(buffer.slice(framePosition, frameSize));

    const ID3Version = ID3Frame[3];
    const tagFlags = parseTagHeaderFlags(ID3Frame);

    let extendedHeaderOffset = 0;
    if (tagFlags.extendedHeader) {
        if (ID3Version === 3) {
            const view = new DataView(buffer.buffer);
            extendedHeaderOffset = 4 + view.getUint32(10);
        } else if (ID3Version === 4) {
            extendedHeaderOffset = decodeSize(buffer.slice(10, 14));
        }
    }

    const ID3TagBody = new Uint8Array(frameSize - 10 - extendedHeaderOffset);
    ID3TagBody.set(buffer.slice(framePosition + 10 + extendedHeaderOffset, framePosition + frameSize));

    const frameIdentifierSize = (ID3Version === 2) ? 3 : 4
    const frameHeaderSize = (ID3Version === 2) ? 6 : 10
    const decoder = new TextDecoder('ISO-8859-1');
    let currentPosition = 0

    while (currentPosition < ID3TagBody.length && ID3TagBody[currentPosition] !== 0x00) {
        const frameHeader = ID3TagBody.subarray(currentPosition, currentPosition + frameHeaderSize);
        const decodeSize = ID3Version === 4;
        const frameBodySize = getFrameSize(frameHeader, decodeSize, ID3Version);
        if (frameBodySize + frameHeaderSize > (ID3TagBody.length - currentPosition)) {
            break;
        }

        const frameHeaderFlags = parseFrameHeaderFlags(frameHeader, ID3Version);
        if (!frameHeaderFlags.encryption && !frameHeaderFlags.compression) {

            const name = decoder.decode(frameHeader.subarray(0, frameIdentifierSize));
            let identifier = (ID3Version === 2) ? FRAME_IDENTIFIERS_V2[name] : FRAME_IDENTIFIERS_V3[name];

            if (identifier) {
                const frameBodyOffset = frameHeaderFlags.dataLengthIndicator ? 4 : 0;
                const frameBodyStart = currentPosition + frameHeaderSize + frameBodyOffset;
                let frameBody = ID3TagBody.subarray(frameBodyStart, frameBodyStart + frameBodySize - frameBodyOffset);

                if (frameHeaderFlags.unsynchronisation) {
                    frameBody = processUnsynchronisedBuffer(frameBody);
                }

                tags[identifier] = decoder.decode(frameBody).replace(/[\0\u0003]/g, '');
            }
        }

        currentPosition += frameBodySize + frameHeaderSize
    }

    return tags
}

const removeTagsFromBuffer = (buffer: Uint8Array): Uint8Array => {
    const framePosition = getFramePosition(buffer);

    if (framePosition === -1) {
        return buffer;
    }

    const encodedSize = buffer.slice(framePosition + 6, framePosition + 10)
    const enc = new Uint8Array(encodedSize);
    if (!isValidEncodedSize(enc)) {
        throw new Error('Invalid encoded size');
    }

    if (buffer.byteLength >= framePosition + 10) {
        const size = decodeSize(enc)
        const frontValues = buffer.slice(0, framePosition);
        const backValues = buffer.slice(framePosition + size + 10);
        const mergedArray = new Uint8Array(frontValues.length + backValues.length);
        mergedArray.set(frontValues);
        mergedArray.set(backValues, framePosition);
        return mergedArray;
    }

    return buffer;
};

const createTags = (tags: { [key: string ]: string }): Uint8Array => {
    const frames: { [key: string ]: string } = {};

    let length = 10;
    for (const [key, value] of Object.entries(tags)) {
        const found = Object.entries(FRAME_IDENTIFIERS_V3).find(([_, label]) => label === key);
        const identifier = found ? found[0] : undefined;
        if (identifier && identifier.length === 4) {
            length += value.length + 11;
            frames[identifier] = value;
        }
    }

    const tagBuffer = new Uint8Array(length);
    const view = new DataView(tagBuffer.buffer);

    let offset = 0;
    const encoder = new TextEncoder();

    // ID3 header
    tagBuffer.set(encoder.encode('ID3'), offset);
    offset += 3;
    view.setUint16(offset, 0x0300);
    offset += 2;
    view.setUint16(offset, 0x0000);
    offset += 1;
    tagBuffer.set(encodeSize(length - 10), offset);
    offset += 4;

    for (const [identifier, text] of Object.entries(frames)) {
        // Tag header
        tagBuffer.set(encoder.encode(identifier), offset);
        offset += 4;
        view.setUint32(offset, text.length + 1);
        offset += 6;

        // Tag body
        view.setUint8(offset, 0x00); // ISO-8859-1
        offset += 1;
        tagBuffer.set(encoder.encode(text), offset);
        offset += text.length;
    }

    return tagBuffer;
};

const parseTagHeaderFlags = (header: Uint8Array) => {
    if (header.length < 10) {
        return {}
    }
    const version = header[3]
    const flagsByte = header[5]
    if (version === 3) {
        return {
            unsynchronisation: !!(flagsByte & 128),
            extendedHeader: !!(flagsByte & 64),
            experimentalIndicator: !!(flagsByte & 32)
        }
    }
    if (version === 4) {
        return {
            unsynchronisation: !!(flagsByte & 128),
            extendedHeader: !!(flagsByte & 64),
            experimentalIndicator: !!(flagsByte & 32),
            footerPresent: !!(flagsByte & 16)
        }
    }
    return {}
}

const getFramePosition = (buffer: Uint8Array): number => {
    let framePosition = -1
    let frameHeaderValid = false
    do {
        framePosition = find(buffer, 'ID3', framePosition + 1)
        if (framePosition !== -1) {
            frameHeaderValid = isValidID3Header(buffer.slice(framePosition, framePosition + 10))
        }
    } while (framePosition !== -1 && !frameHeaderValid)

    if (!frameHeaderValid) {
        return -1
    }
    return framePosition
};

const find = (buffer: Uint8Array, search: string, byteOffset = 0, doubleByte = false): number => {
    let indexSize = 1
    let arrLength = buffer.length

    if (doubleByte) {
        indexSize = 2
        arrLength /= 2
        byteOffset /= 2
    }

    const view = new DataView(buffer.buffer);
    const read = (i: number) => (indexSize === 1) ? buffer[i] : view.getUint16(i * indexSize);

    let foundIndex = -1
    for (let i = byteOffset; i < arrLength; i++) {
        if (read(i) === search.charCodeAt(foundIndex === -1 ? 0 : i - foundIndex)) {
            if (foundIndex === -1) foundIndex = i
            if (i - foundIndex + 1 === search.length) return foundIndex * indexSize
        } else {
            if (foundIndex !== -1) i -= i - foundIndex
            foundIndex = -1
        }
    }

    return -1;
};

const isValidEncodedSize = (buffer: Uint8Array) => {
    // The size must not have the bit 7 set
    return ((
        buffer[0] |
        buffer[1] |
        buffer[2] |
        buffer[3]
    ) & 128) === 0
}

const encodeSize = (size: number): Uint8Array => {
    const byte_3 = size & 0x7F;
    const byte_2 = (size >> 7) & 0x7F;
    const byte_1 = (size >> 14) & 0x7F;
    const byte_0 = (size >> 21) & 0x7F;
    return new Uint8Array([byte_0, byte_1, byte_2, byte_3]);
};

const decodeSize = (buffer: Uint8Array) => {
    return (
        (buffer[0] << 21) +
        (buffer[1] << 14) +
        (buffer[2] << 7) +
        buffer[3]
    );
};

const isValidID3Header = (buffer: Uint8Array) => {
    if (buffer.length < 10) {
        return false
    }
    if (readUint(buffer, 0, 3) !== 0x494433) {
        return false
    }
    if ([0x02, 0x03, 0x04].indexOf(buffer[3]) === -1 || buffer[4] !== 0x00) {
        return false
    }
    return isValidEncodedSize(buffer.slice(6, 10))
};

const readUint = (buffer: Uint8Array, offset: number, byteLength: number): number => {
    offset = offset >>> 0
    byteLength = byteLength >>> 0

    let val = buffer[offset + --byteLength]
    let mul = 1
    while (byteLength > 0 && (mul *= 0x100)) {
        val += buffer[offset + --byteLength] * mul
    }

    return val
};

const getFrameSize = (buffer: Uint8Array, decode: boolean, ID3Version: number): number => {
    let decodeBytes
    if (ID3Version > 2) {
        decodeBytes = [buffer[4], buffer[5], buffer[6], buffer[7]]
    } else {
        decodeBytes = [buffer[3], buffer[4], buffer[5]]
    }
    const b = new Uint8Array(decodeBytes);
    if (decode) {
        return decodeSize(b)
    } else {
        return readUint(b, 0, decodeBytes.length);
    }
};

const parseFrameHeaderFlags = (header: Uint8Array, ID3Version: number): { [key: string]: boolean } => {
    if (header.length !== 10) {
        return {}
    }
    const flagsFirstByte = header[8]
    const flagsSecondByte = header[9]
    if (ID3Version === 3) {
        return {
            tagAlterPreservation: !!(flagsFirstByte & 128),
            fileAlterPreservation: !!(flagsFirstByte & 64),
            readOnly: !!(flagsFirstByte & 32),
            compression: !!(flagsSecondByte & 128),
            encryption: !!(flagsSecondByte & 64),
            groupingIdentity: !!(flagsSecondByte & 32),
            dataLengthIndicator: !!(flagsSecondByte & 128)
        }
    }
    if (ID3Version === 4) {
        return {
            tagAlterPreservation: !!(flagsFirstByte & 64),
            fileAlterPreservation: !!(flagsFirstByte & 32),
            readOnly: !!(flagsFirstByte & 16),
            groupingIdentity: !!(flagsSecondByte & 64),
            compression: !!(flagsSecondByte & 8),
            encryption: !!(flagsSecondByte & 4),
            unsynchronisation: !!(flagsSecondByte & 2),
            dataLengthIndicator: !!(flagsSecondByte & 1)
        }
    }
    return {}
};

const processUnsynchronisedBuffer = (buffer: Uint8Array): Uint8Array => {
    const newDataArr = []
    if (buffer.length > 0) {
        newDataArr.push(buffer[0])
    }
    for (let i = 1; i < buffer.length; i++) {
        if (buffer[i - 1] === 0xFF && buffer[i] === 0x00)
            continue
        newDataArr.push(buffer[i])
    }
    return new Uint8Array(newDataArr);
};

const FRAME_IDENTIFIERS_V2: { [key: string]: string } = {
    TAL: 'album',
    TBP: 'bpm',
    TCM: 'composer',
    TCO: 'genre',
    TCR: 'copyright',
    TDA: 'date',
    TDY: 'playlistDelay',
    TEN: 'encodedBy',
    TFT: 'fileType',
    TIM: 'time',
    TKE: 'initialKey',
    TLA: 'language',
    TLE: 'length',
    TMT: 'mediaType',
    TOA: 'originalArtist',
    TOF: 'originalFilename',
    TOL: 'originalTextwriter',
    TOR: 'originalYear',
    TOT: 'originalTitle',
    TP1: 'artist',
    TP2: 'performerInfo',
    TP3: 'conductor',
    TP4: 'remixArtist',
    TPA: 'partOfSet',
    TPB: 'publisher',
    TRC: 'ISRC',
    TRD: 'recordingDates',
    TRK: 'trackNumber',
    TSI: 'size',
    TSS: 'encodingTechnology',
    TT1: 'contentGroup',
    TT2: 'title',
    TT3: 'subtitle',
    TYE: 'year'
};

const FRAME_IDENTIFIERS_V3: { [key: string]: string } = {
    TALB: 'album',
    TBPM: 'bpm',
    TCOM: 'composer',
    TCON: 'genre',
    TCOP: 'copyright',
    TDAT: 'date',
    TDEN: 'encodingTime',
    TDLY: 'playlistDelay',
    TDOR: 'originalReleaseTime',
    TDRC: 'recordingTime',
    TDRL: 'releaseTime',
    TDTG: 'taggingTime',
    TENC: 'encodedBy',
    TEXT: 'textWriter',
    TFLT: 'fileType',
    TIME: 'time',
    TIPL: 'involvedPeopleList',
    TIT1: 'contentGroup',
    TIT2: 'title',
    TIT3: 'subtitle',
    TKEY: 'initialKey',
    TLAN: 'language',
    TLEN: 'length',
    TMCL: 'musicianCreditsList',
    TMED: 'mediaType',
    TMOO: 'mood',
    TOAL: 'originalTitle',
    TOFN: 'originalFilename',
    TOLY: 'originalTextwriter',
    TOPE: 'originalArtist',
    TORY: 'originalYear',
    TOWN: 'fileOwner',
    TPE1: 'artist',
    TPE2: 'performerInfo',
    TPE3: 'conductor',
    TPE4: 'remixArtist',
    TPOS: 'partOfSet',
    TPRO: 'producedNotice',
    TPUB: 'publisher',
    TRCK: 'trackNumber',
    TRDA: 'recordingDates',
    TRSN: 'internetRadioName',
    TRSO: 'internetRadioOwner',
    TSIZ: 'size',
    TSOA: 'albumSortOrder',
    TSOP: 'performerSortOrder',
    TSOT: 'titleSortOrder',
    TSRC: 'ISRC',
    TSSE: 'encodingTechnology',
    TSST: 'setSubtitle',
    TYER: 'year'
};
