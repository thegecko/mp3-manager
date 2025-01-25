export interface ID3 {
    title?: string;
    artist?: string;
}

interface Frame {
    name: string;
    flags: { [key: string]: boolean };
    body: Uint8Array;
    dataLengthIndicator?: number;
}

export const readId3 = async (buffer: ArrayBuffer): Promise<ID3> => {
    const tags = getTagsFromBuffer(new Uint8Array(buffer));
    return {
        title: tags.title || 'unknown',
        artist: tags.artist || 'unknown'
    };
};

export const removeId3 = (buffer: ArrayBuffer): ArrayBuffer => {
    return removeTagsFromBuffer(new Uint8Array(buffer)).buffer;
};

export const addId3 = (buffer: ArrayBuffer, id3: ID3): ArrayBuffer => {
    throw new Error('Not implemented');
};

const getTagsFromBuffer = (buffer: Uint8Array) => {
    const framePosition = getFramePosition(buffer);
    if (framePosition === -1) {
        return getTagsFromFrames([], 3)
    }
    const frameSize = decodeSize(buffer.slice(framePosition + 6, framePosition + 10)) + 10
    const ID3Frame = new Uint8Array(frameSize + 1);// Buffer.alloc(frameSize + 1)
    ID3Frame.set(buffer.slice(framePosition, frameSize)) //filebuffer.copy(ID3Frame, 0, framePosition)
    //ID3 version e.g. 3 if ID3v2.3.0
    const ID3Version = ID3Frame[3]
    const tagFlags = parseTagHeaderFlags(ID3Frame)
    let extendedHeaderOffset = 0

    if (tagFlags.extendedHeader) {
        if (ID3Version === 3) {
            const view = new DataView(buffer.buffer);
            extendedHeaderOffset = 4 + view.getUint32(10)
        } else if (ID3Version === 4) {
            extendedHeaderOffset = decodeSize(buffer.slice(10, 14))
        }
    }

    const ID3FrameBody = new Uint8Array(frameSize - 10 - extendedHeaderOffset)
    ID3FrameBody.set(buffer.slice(framePosition + 10 + extendedHeaderOffset, framePosition + frameSize)) //    filebuffer.copy(ID3FrameBody, 0, framePosition + 10 + extendedHeaderOffset)

    const frames = getFramesFromID3Body(ID3FrameBody, ID3Version)
    return getTagsFromFrames(frames, ID3Version)
}

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

const decodeSize = (buffer: Uint8Array) => {
    return (
        (buffer[0] << 21) +
        (buffer[1] << 14) +
        (buffer[2] << 7) +
        buffer[3]
    )
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

const getFramesFromID3Body = (ID3TagBody: Uint8Array, ID3Version: number): Frame[] => {
    let currentPosition = 0
    const frames: Frame[] = []

    if (!ID3TagBody) {
        return frames
    }

    const frameIdentifierSize = (ID3Version === 2) ? 3 : 4
    const frameHeaderSize = (ID3Version === 2) ? 6 : 10
    const decoder = new TextDecoder();

    while (currentPosition < ID3TagBody.length && ID3TagBody[currentPosition] !== 0x00) {
        const frameHeader = ID3TagBody.subarray(currentPosition, currentPosition + frameHeaderSize)

        const frameIdentifier = decoder.decode(frameHeader.subarray(0, frameIdentifierSize));// frameHeader.toString('utf8', 0, frameIdentifierSize)
        const decodeSize = ID3Version === 4
        const frameBodySize = getFrameSize(frameHeader, decodeSize, ID3Version)

        // Prevent errors when the current frame's size exceeds the remaining tags size (e.g. due to broken size bytes).
        if (frameBodySize + frameHeaderSize > (ID3TagBody.length - currentPosition)) {
            break
        }

        const frameHeaderFlags = parseFrameHeaderFlags(frameHeader, ID3Version)
        // Frames may have a 32-bit data length indicator appended after their header,
        // if that is the case, the real body starts after those 4 bytes.
        const frameBodyOffset = frameHeaderFlags.dataLengthIndicator ? 4 : 0
        const frameBodyStart = currentPosition + frameHeaderSize + frameBodyOffset
        const frameBody = ID3TagBody.subarray(frameBodyStart, frameBodyStart + frameBodySize - frameBodyOffset)

        const frame: Frame = {
            name: frameIdentifier,
            flags: frameHeaderFlags,
            body: frameHeaderFlags.unsynchronisation ? processUnsynchronisedBuffer(frameBody) : frameBody
        }
        if (frameHeaderFlags.dataLengthIndicator) {
            const view = new DataView(ID3TagBody.buffer);
            frame.dataLengthIndicator = view.getUint32(currentPosition + frameHeaderSize)
        }
        frames.push(frame)

        //  Size of frame body + its header
        currentPosition += frameBodySize + frameHeaderSize
    }

    return frames
}

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
}

const getTagsFromFrames = (frames: Frame[], ID3Version: number) => {
    const tags: { [key: string]: string } = {}
    const decoder = new TextDecoder('ISO-8859-1');
    frames.forEach((frame) => {
        let frameIdentifier
        let identifier: string | undefined
        if (ID3Version === 2) {
            frameIdentifier = FRAME_IDENTIFIERS.v3[FRAME_INTERNAL_IDENTIFIERS.v2[frame.name]]
            identifier = FRAME_INTERNAL_IDENTIFIERS.v2[frame.name]
        } else if (ID3Version === 3 || ID3Version === 4) {
            // Due to their similarity, it's possible to mix v3 and v4 frames even if they don't exist in their corrosponding spec.
            // Programs like Mp3tag allow you to do so, so we should allow reading e.g. v4 frames from a v3 ID3 Tag
            frameIdentifier = frame.name
            identifier = FRAME_INTERNAL_IDENTIFIERS.v3[frame.name] || FRAME_INTERNAL_IDENTIFIERS.v4[frame.name]
        }

        if (!frameIdentifier || !identifier || frame.flags.encryption) {
            return
        }

        if (frame.flags.compression) {
            //unsupported
            return;
        }

        // only read text
        if (frameIdentifier.startsWith('T')) {
            tags[identifier] = decoder.decode(frame.body).replace(/\0/g, '');
        }
    })

    return tags
}

const FRAME_IDENTIFIERS: { [key: string]: { [key: string]: string } } = {
    v2: {
        album: "TAL",
        bpm: "TBP",
        composer: "TCM",
        genre: "TCO",
        copyright: "TCR",
        date: "TDA",
        playlistDelay: "TDY",
        encodedBy: "TEN",
        textWriter: "TEXT",
        fileType: "TFT",
        time: "TIM",
        contentGroup: "TT1",
        title: "TT2",
        subtitle: "TT3",
        initialKey: "TKE",
        language: "TLA",
        length: "TLE",
        mediaType: "TMT",
        originalTitle: "TOT",
        originalFilename: "TOF",
        originalTextwriter: "TOL",
        originalArtist: "TOA",
        originalYear: "TOR",
        artist: "TP1",
        performerInfo: "TP2",
        conductor: "TP3",
        remixArtist: "TP4",
        partOfSet: "TPA",
        publisher: "TPB",
        trackNumber: "TRK",
        recordingDates: "TRD",
        size: "TSI",
        ISRC: "TRC",
        encodingTechnology: "TSS",
        year: "TYE",
        image: "PIC",
        commercialUrl: "WCM",
        copyrightUrl: "WCP",
        fileUrl: "WAF",
        artistUrl: "WAR",
        audioSourceUrl: "WAS",
        publisherUrl: "WPB",
        userDefinedUrl: "WXX"
    },
    v3: {
        album: "TALB",
        bpm: "TBPM",
        composer: "TCOM",
        genre: "TCON",
        copyright: "TCOP",
        date: "TDAT",
        playlistDelay: "TDLY",
        encodedBy: "TENC",
        textWriter: "TEXT",
        fileType: "TFLT",
        time: "TIME",
        contentGroup: "TIT1",
        title: "TIT2",
        subtitle: "TIT3",
        initialKey: "TKEY",
        language: "TLAN",
        length: "TLEN",
        mediaType: "TMED",
        originalTitle: "TOAL",
        originalFilename: "TOFN",
        originalTextwriter: "TOLY",
        originalArtist: "TOPE",
        originalYear: "TORY",
        fileOwner: "TOWN",
        artist: "TPE1",
        performerInfo: "TPE2",
        conductor: "TPE3",
        remixArtist: "TPE4",
        partOfSet: "TPOS",
        publisher: "TPUB",
        trackNumber: "TRCK",
        recordingDates: "TRDA",
        internetRadioName: "TRSN",
        internetRadioOwner: "TRSO",
        size: "TSIZ",
        ISRC: "TSRC",
        encodingTechnology: "TSSE",
        year: "TYER",
        comment: "COMM",
        image: "APIC",
        unsynchronisedLyrics: "USLT",
        synchronisedLyrics: "SYLT",
        userDefinedText: "TXXX",
        popularimeter: "POPM",
        private: "PRIV",
        chapter: "CHAP",
        tableOfContents: "CTOC",
        userDefinedUrl: "WXXX",
        commercialUrl: "WCOM",
        copyrightUrl: "WCOP",
        fileUrl: "WOAF",
        artistUrl: "WOAR",
        audioSourceUrl: "WOAS",
        radioStationUrl: "WORS",
        paymentUrl: "WPAY",
        publisherUrl: "WPUB",
        eventTimingCodes: "ETCO",
        commercialFrame: "COMR",
        uniqueFileIdentifier: "UFID"
    },
    /**
     * v4 removes some text frames compared to v3: TDAT, TIME, TRDA, TSIZ, TYER
     * It adds the text frames: TDEN, TDOR, TDRC, TDRL, TDTG, TIPL, TMCL, TMOO, TPRO, TSOA, TSOP, TSOT, TSST
     *
     * Removed other frames: CHAP, CTOC
     */
    v4: {
        image: "APIC",
        comment: "COMM",
        commercialFrame: "COMR",
        eventTimingCodes: "ETCO",
        private: "PRIV",
        popularimeter: "POPM",
        synchronisedLyrics: "SYLT",
        album: "TALB",
        bpm: "TBPM",
        composer: "TCOM",
        genre: "TCON",
        copyright: "TCOP",
        encodingTime: "TDEN",
        playlistDelay: "TDLY",
        originalReleaseTime: "TDOR",
        recordingTime: "TDRC",
        releaseTime: "TDRL",
        taggingTime: "TDTG",
        encodedBy: "TENC",
        textWriter: "TEXT",
        fileType: "TFLT",
        involvedPeopleList: "TIPL",
        contentGroup: "TIT1",
        title: "TIT2",
        subtitle: "TIT3",
        initialKey: "TKEY",
        language: "TLAN",
        length: "TLEN",
        musicianCreditsList: "TMCL",
        mediaType: "TMED",
        mood: "TMOO",
        originalTitle: "TOAL",
        originalFilename: "TOFN",
        originalTextwriter: "TOLY",
        originalArtist: "TOPE",
        fileOwner: "TOWN",
        artist: "TPE1",
        performerInfo: "TPE2",
        conductor: "TPE3",
        remixArtist: "TPE4",
        partOfSet: "TPOS",
        producedNotice: "TPRO",
        publisher: "TPUB",
        trackNumber: "TRCK",
        internetRadioName: "TRSN",
        internetRadioOwner: "TRSO",
        albumSortOrder: "TSOA",
        performerSortOrder: "TSOP",
        titleSortOrder: "TSOT",
        ISRC: "TSRC",
        encodingTechnology: "TSSE",
        setSubtitle: "TSST",
        userDefinedText: "TXXX",
        unsynchronisedLyrics: "USLT",
        commercialUrl: "WCOM",
        copyrightUrl: "WCOP",
        fileUrl: "WOAF",
        artistUrl: "WOAR",
        audioSourceUrl: "WOAS",
        radioStationUrl: "WORS",
        paymentUrl: "WPAY",
        publisherUrl: "WPUB",
        userDefinedUrl: "WXXX"
    }
}

/**
 * Contains FRAME_IDENTIFIERS but frame alias / name swapped.
 */
const FRAME_INTERNAL_IDENTIFIERS = Object.keys(FRAME_IDENTIFIERS).reduce<{ [key: string]: any }>((acc, versionKey) => {
    acc[versionKey] = Object.keys(FRAME_IDENTIFIERS[versionKey]).reduce<{ [key: string]: any }>((acc, tagKey) => {
        acc[FRAME_IDENTIFIERS[versionKey][tagKey]] = tagKey
        return acc
    }, {})
    return acc
}, {})
