# Browser-Based MP3 File Manager for Sony Network Walkmans

This is a project to support MP3 file management on older Sony network walkmans replacing the need for the `MP3 File Manager` or `SonicStage` applications.

A guiding principal for this project is to keep the manager (html file) under 100kb in size to maximise storage for music on devices.

## Benefits

This manager is a single-page web application in an `.html` file which leverages modern browser features such as the <a href='https://caniuse.com/filesystem'>FileSystem API</a> and <a href='https://caniuse.com/audio-api'>WebAudio API</a>.

This approach means:

- It's small (< 100kb). MP3 File Manager is ~600kb, so if you are storing the manager on the device, ~500kb can be reclaimed
- Cross platform. Original software is primarily focussed on requiring 32 bit Windows. This can run wherever you have a modern browser.
- More Features. The manager supports:
  - File and folder uploads (via a file dialog or drag-and-drop)
  - File and folder re-ordering
  - Renaming and deleting
  - Downloading

## Hardware Support

### ESYS
- Generation 0 (NW-MSx, NW-Ex, NW-S4, NW-E8P, NW-MSxx, NW-HD1, NW-HD2)
- Generation 1 (NW-Sxx, NW-Exx except NW-E99)
- Generation 2 (NW-E99)

### OMGAUDIO (not yet implemented)
- Generation 3 (NW-HD3, NW-HD5, NW-E10x/E2xx/E3xx/E4xx/E5xx)
- Generation 4 (NW-A1000, NW-A1200, NW-A3000, NW-A60x)
- Generation 5 (NW-E00x)
- Generation 6 (NW-S20x)
- Generation 7 (NW-E01x, NW-S60x/S70x, NW-S71x, NW-A80x, NW-A91x)

I haven't yet implemented OMGAUDIO support due to not having relevant hardware. Implementation would be possible in 2 ways:
- Someone with access to an OMGAUDIO device opening a PR (the template to complete is here: [omg-database.ts](https://github.com/thegecko/mp3-manager/blob/main/src/database/omg-database.ts))
- Someone donating an OMGAUDIO compatible device for me to test

## Usage

You have 2 options to use this manager...

Open the hosted version of the web app:

https://thegecko.github.io/mp3-manager/

Download `index.html` from a release and copy it to your device:

https://github.com/thegecko/mp3-manager/releases

Once opened, select the drive you want to manage and everything should be self explanatory.

![Screenshot 2025-02-02 at 19 53 51](https://github.com/user-attachments/assets/8260f292-efff-4a7e-a48b-cb3d467caf9c)

## Implementation Status

### Database Formats

- [x] ESYS
- [ ] OMGAUDIO (PRs welcome!)

### Tracks

- [x] Add
- [x] Drag-Drop
- [x] Reorder
- [x] Rename
- [x] Delete
- [x] Download

### Folders

- [x] Create
- [x] Add
- [x] Drag-Drop
- [x] Reorder
- [x] Rename
- [x] Delete
- [ ] Download (needs zip spport, jszip would add ~100kb)

## Credits & Prior Art

Many thanks go to `waider` for the excellent mple info over at: https://waider.ie/~waider/hacks/workshop/c/mple/

The mini ID3 library was strongly influenced by the library at https://github.com/Zazama/node-id3

Previous open source managers that I'm aware of which already existed:
- https://sourceforge.net/projects/symphonic/
- https://github.com/brianpipa/jsymphonic
