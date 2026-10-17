// Small library to create .zip files

export const createZip = async (name: string, files: File[]): Promise<File> => {
    const parts: BlobPart[] = [];
    const directory: BlobPart[] = [];
    let offset = 0;

    for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        const path = new TextEncoder().encode(file.name);
        const crc = crc32(data);
        const header = new Uint8Array(30 + path.length);
        const view = new DataView(header.buffer);
        writeHeader(view, 0x04034b50, path, crc, data.length);
        header.set(path, 30);
        parts.push(header, data);

        const entry = new Uint8Array(46 + path.length);
        const entryView = new DataView(entry.buffer);
        writeHeader(entryView, 0x02014b50, path, crc, data.length, offset);
        entryView.setUint16(4, 20, true);
        entry.set(path, 46);
        directory.push(entry);
        offset += header.length + data.length;
    }

    const directorySize = directory.reduce((total, part) => total + (part as Uint8Array).byteLength, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, directorySize, true);
    endView.setUint32(16, offset, true);

    return new File([...parts, ...directory, end], `${name}.zip`, { type: 'application/zip' });
};

const writeHeader = (view: DataView, signature: number, path: Uint8Array, crc: number, size: number, offset = 0): void => {
    view.setUint32(0, signature, true);
    view.setUint16(signature === 0x02014b50 ? 6 : 4, 20, true);
    view.setUint32(signature === 0x02014b50 ? 16 : 14, crc, true);
    view.setUint32(signature === 0x02014b50 ? 20 : 18, size, true);
    view.setUint32(signature === 0x02014b50 ? 24 : 22, size, true);
    view.setUint16(signature === 0x02014b50 ? 28 : 26, path.length, true);
    if (signature === 0x02014b50) {
        view.setUint32(42, offset, true);
    }
};

const crc32 = (data: Uint8Array): number => {
    let crc = -1;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ -1) >>> 0;
};
