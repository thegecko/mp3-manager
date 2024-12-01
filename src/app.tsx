import { useEffect, useRef, useState } from "preact/hooks";
import { EsysDatabase, Folder, Track } from "./esys-database";
import TreeView from 'react-simple-jstree';
import $ from 'jquery';

const data = {
    plugins: ['dnd', 'contextmenu'],
    core: {
      data: [
		{
			"id": "animal",
			"parent": "#",
			"text": "Animals",
			"data": {
				"name": "Quick"
			},
			"type": "root"
		},
		{
			"id": "device",
			"parent": "#",
			"text": "Devices",
			"type": "root"
		},
		{
			"id": "dog",
			"parent": "animal",
			"text": "Dogs",
			"type": "file"
		},
		{
			"id": "lion",
			"parent": "animal",
			"text": "Lions",
			"type": "file"
		},
		{
			"id": "mobile",
			"parent": "device",
			"text": "Mobile Phones",
			"type": "file"
		},
		{
			"id": "lappy",
			"parent": "device",
			"text": "Laptops",
			"type": "file"
		},
		{
			"id": "doberman",
			"parent": "dog",
			"text": "Doberman"
		},
		{
			"id": "dalmation",
			"parent": "dog",
			"text": "Dalmatian"
		},
		{
			"id": "schnauzer",
			"parent": "dog",
			"text": "Schnauzer"
		},
		{
			"id": "african",
			"parent": "lion",
			"text": "African Lion"
		},
		{
			"id": "indian",
			"parent": "lion",
			"text": "Indian Lion",
			"data": {
				"lastName": "Silver"
			}
		},
		{
			"id": "apple",
			"parent": "mobile",
			"text": "Apple iPhone"
		},
		{
			"id": "samsung",
			"parent": "mobile",
			"text": "Samsung Galaxy"
		},
		{
			"id": "lenovo",
			"parent": "lappy",
			"text": "Lenovo"
		},
		{
			"id": "hp",
			"parent": "lappy",
			"text": "HP"
		}
	]
    }
};

/*
$('#jstree').jstree({
	plugins: [
		'dnd',
		'types',
		'contextmenu'
	],
	core: {
		data: theTree,
		check_callback: true,
		themes: {
			dots: false,
			responsive: true
		}
	},
	types: {
		root: {
			icon: 'fa fa-folder-o fa-lg'
		},
		default: {
			icon: 'fa fa-leaf'
		},
		file: {
			icon: 'fa fa-file-o'
		}
	}

}).on('ready.jstree', function(e) {
	$(this).jstree().open_all('animal', 300);

// The drop event happens if a drag starts outside the window
// For example, when dragging a browser URL from the address bar,
// or selected text from another window

}).on('drop', function(evt) {
	evt.preventDefault();
	var e = evt.originalEvent;

	//debugger;

	var tree = $(evt.target).jstree(),
		node = tree.get_node(evt.target),
		parent = $('#' + node.id).parent(),
		index = parent.children().index($('#' + node.id)) + 1,
		newNode = {};
		if (node.parent === '#') {
			parent = '#';
		}

	if (e.dataTransfer.getData('URL')) {
    	if (e.dataTransfer.getData('text/html')) {
        	var anchor = $(e.dataTransfer.getData('text/html')).filter(function() {
                return $(this).is('a');
            }).eq(0);
            if (anchor.length && typeof anchor.data('full-url') !== 'undefined') {
            	newNode.text = anchor.text();
                newNode.data = {
                	target: anchor.data('full-url'),
                    shorturl: anchor.attr('href')
                };
            }
        } else {
			var url = e.dataTransfer.getData('URL');
			if (e.dataTransfer.getData('public.url-name')) {
				newNode.text = shorten(e.dataTransfer.getData('public.url-name'));
			} else {
				newNode.text = shorten(basename(url));
			}
			newNode.a_attr = {
				title: url
			}
            newNode.data = {
            	target: url
            }
        }
	} else if (e.dataTransfer.getData('Text')) {
		var txt = e.dataTransfer.getData('Text'),
			shortened = shorten(txt);
		if (shortened != txt) {
			newNode.data = {
				original_text: txt
			}
		}
		newNode.text = shortened;
	}
	if (node.type == 'root' || node.type == 'file') {
		tree.create_node(node, newNode, 'last');
	} else {
		tree.create_node(parent, newNode, index);
	}
});
*/
export default function App() {
    const [state, setState] = useState({
        dataHandle: undefined as FileSystemDirectoryHandle | undefined,
        dbHandle: undefined as FileSystemFileHandle | undefined,
        folders: [] as Folder[],
        tracks: [] as Track[]
    });
    //const [fileSystem, setFileSystem] = useState<FileSystemDirectoryHandle>();

    const onClick = async () => {
        // Open file picker and destructure the result the first handle
        const fileSystem = await window.showDirectoryPicker({ startIn: "music", mode: 'readwrite' });
        if (fileSystem) {
            try {
                const rootHandle = await fileSystem.getDirectoryHandle('ESYS');
                const dataHandle = await rootHandle.getDirectoryHandle('NW-MP3');
                const dbHandle = await rootHandle.getFileHandle('PBLIST1.DAT');

                const dbFile = await dbHandle.getFile();
                const contents = await dbFile.arrayBuffer();
                const db = new EsysDatabase(contents);
                const folders = await db.getFolders();
                const tracks = await db.getTracks();
                /*
            const entries = fileSystem.entries();
            const files = [];
            for await (const [name] of entries) {
                files.push(name);
            }
                */
                setState({...state, dataHandle, dbHandle, folders, tracks});
            } catch (e) {
                alert('check this is the right folder');
            }
        }
    }

    const saveFile = async (file: File) => {
        /*
        let id = 1;
        for (const file of state.tracks) {
            if (file.id >= id) {
                id = file.id + 1;
            }
        }

        const files = state.tracks;
        files.push({ id, name: file.name });
        
        if (state.dbHandle) {
            const writable = await state.dbHandle.createWritable();
            await writable.write(JSON.stringify(files));
            await writable.close();
        }

        if (state.dataHandle) {
            const fileHandle = await state.dataHandle.getFileHandle(`${id}.data`, { create: true });
            const writable = await fileHandle.createWritable();
            const buffer = await file.arrayBuffer();
            await writable.write(buffer)
            await writable.close();
        }

        setState({...state, tracks: files});
        */
    };

    const onDrop = async (event: DragEvent) => {
        event.preventDefault();

        if (event.dataTransfer?.items) {
            // Use DataTransferItemList interface to access the file(s)
            [...event.dataTransfer.items].forEach((item, i) => {
                // If dropped items aren't files, reject them
                if (item.kind === "file") {
                    const file = item.getAsFile();
                    if (file) {
                        saveFile(file);
                    }
                }
            });
        } else if (event.dataTransfer?.files) {
            // Use DataTransfer interface to access the file(s)
            [...event.dataTransfer.files].forEach((file, i) => {
                saveFile(file);
            });
        }
    }

    const onDragOver = (event: DragEvent) => {
        event.preventDefault();
    }

    const folderNodes = state.folders.map(folder => (        
        <>
            <span>{folder.name} {folder.offset}</span>
        </>
    ));

    const trackNodes = state.tracks.map(track => (        
        <>
            <span>{track.artist}: {track.title} ({track.file})</span>
        </>
    ));

    const onDrop2 = async (evt: DragEvent) => {
        evt.preventDefault();
        var e = evt.originalEvent;
    
        //debugger;
    
        var tree = $(evt.target).jstree(),
            node = tree.get_node(evt.target),
            parent = $('#' + node.id).parent(),
            index = parent.children().index($('#' + node.id)) + 1,
            newNode = {};
            if (node.parent === '#') {
                parent = '#';
            }
    
        if (e.dataTransfer.getData('URL')) {
            if (e.dataTransfer.getData('text/html')) {
                var anchor = $(e.dataTransfer.getData('text/html')).filter(function() {
                    return $(this).is('a');
                }).eq(0);
                if (anchor.length && typeof anchor.data('full-url') !== 'undefined') {
                    newNode.text = anchor.text();
                    newNode.data = {
                        target: anchor.data('full-url'),
                        shorturl: anchor.attr('href')
                    };
                }
            } else {
                var url = e.dataTransfer.getData('URL');
                if (e.dataTransfer.getData('public.url-name')) {
                    newNode.text = shorten(e.dataTransfer.getData('public.url-name'));
                } else {
                    newNode.text = shorten(basename(url));
                }
                newNode.a_attr = {
                    title: url
                }
                newNode.data = {
                    target: url
                }
            }
        } else if (e.dataTransfer.getData('Text')) {
            var txt = e.dataTransfer.getData('Text'),
                shortened = shorten(txt);
            if (shortened != txt) {
                newNode.data = {
                    original_text: txt
                }
            }
            newNode.text = shortened;
        }
        if (node.type == 'root' || node.type == 'file') {
            tree.create_node(node, newNode, 'last');
        } else {
            tree.create_node(parent, newNode, index);
        }
    }

    const containerRef = useRef(null as HTMLDivElement | null);
    const treeRef = useRef(null);
/*
    useEffect(() => {
        document.addEventListener('dnd_stop.vakata', onDragOver);
        if (containerRef.current) {
            containerRef.current.addEventListener('drop', onDrop2);
        }
      }, []);
      */

      let added = false;

      const onDragOver2 = (evt: DragEvent) => {
        evt.preventDefault();
        if (!added) {
            $.vakata.dnd.start(
                    evt,
                    {
                        jstree: true,
                        obj: $(
                            `<a href="#" id="anchor" class="jstree-anchor">`
                        ),
                        nodes: ["1"]
                    },
                    $('<div id="jstree-dnd" class="jstree-default"><i class="jstree-icon jstree-er"></i> DEMO<div>')
                );
                  added = true;
            }
            $.vakata.dnd.drag(evt);
    }

    return (
        <div ref={containerRef} onDragOver={onDragOver2}
        >
        <TreeView ref={treeRef} treeData={data} onChange={(e, data) => console.log(e, data)} onDrop={onDrop2} />
            <button
                class="hover:bg-blue-400 group flex items-center rounded-md bg-blue-500 text-white text-sm font-medium pl-2 pr-3 py-2 shadow-sm"
                onClick={onClick}>
                    Select drive
            </button>
            <div
                class="hover:border-blue-500 hover:border-solid hover:bg-white hover:text-blue-500 group w-full flex flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-sm leading-6 text-slate-900 font-medium py-3"
                id='drop_zone'
                onDrop={onDrop}
                onDragOver={onDragOver}
            >
                {folderNodes}
                {trackNodes}
                Drag one or more files to this drop zone
            </div>
        </div>
    );
}

/*
$(document).on('dnd_start.vakata', function(e, data) {
	//console.log('Started dragging node from jstree');
}).on('dnd_move.vakata', function(e, data) {
	//console.log('Moving node from jstree to div');
	//debugger;

}).on('dnd_stop.vakata', function(e, data) {

	//debugger;

	// if dropping into the big blue circle, create a div element, store
	// its jstree data as data-dnd, then append it to the circle

	if (data.event.target.id === 'dragTarget'  || $(data.event.target).parents('#dragTarget').length) {
		if (data.data.jstree && data.data.origin) {
			var node = data.data.origin.get_node(data.element);
			$(`<div draggable="true"><i class="${node.icon}"></i>&nbsp;${node.text}</div>`).data(
				'dnd',
				{
					id: randomID(),
					text: node.text,
					type: node.type,
					data: node.data
				}
			).appendTo('#dragTarget');
			if (!data.event.ctrlKey) {
				data.data.origin.delete_node(node);
			}
		}

	// if dropping anywhere else, including the jstree object

	} else {
		if (old_currentTarget !== null) {
			old_currentTarget.unselectable = old_unselectable;
			old_currentTarget.onselectstart = old_onselectstart;
			old_currentTarget = null;
		}
		if ($(data.event.target).parents('#jstree').length) {
			if (draggedDiv !== null) {
				if (!data.event.ctrlKey) {
					draggedDiv.remove();
				}
				draggedDiv = null;
			}
		}	
	}

// dragstart is where we build a jstree object from the dragged object
// and pass it to $.vakata.dnd.start()

}).on('dragstart', function(evt) {

	//debugger;

	var nodes,
		dnd,
		id,
		txt,
		item = $(
			'<div id="jstree-dnd" class="jstree-default"><i class="jstree-icon jstree-er"></i></div>'
		);

	// if it isn't an object from the blue circle, it's from somewhere else
	// in the window, so grab the selected text or innerText of the element

	if (typeof $(evt.target).data('dnd') === 'undefined') {
		draggedDiv = null;
		dnd = {
			id: randomID(),
			text: window.getSelection().toString() || $(evt.target).text()
		};

	}

	item.append(dnd.text);

	// jumping straight into jstree.dnd.start leaves the current target
	// set to unselectable, so save these values to restore them on drop

	old_unselectable = evt.currentTarget.unselectable;
	old_onselectstart = evt.currentTarget.onselectstart;
	old_currentTarget = evt.currentTarget;

	// and now, tell jstree to start dragging this thing around

	return $.vakata.dnd.start(
		evt,
		{
			jstree: true,
			obj: $(
				`<a href="#" id="${dnd.id}_anchor" class="jstree-anchor">`
			),
			nodes: [dnd]
		},
		item
	);

}).on('dragover', function(evt) {
	evt.preventDefault();
	//debugger;
});

var added = false;
$('body')
.on('drop', function (evt) {
evt.preventDefault();
})
.on('dragover', function (evt) {
evt.preventDefault();
if (!added) {
$.vakata.dnd.start(
		evt,
		{
			jstree: true,
			obj: $(
				`<a href="#" id="anchor" class="jstree-anchor">`
			),
			nodes: ["1"]
		},
		$('<div id="jstree-dnd" class="jstree-default"><i class="jstree-icon jstree-er"></i> DEMO<div>')
    );
      added = true;
}
$.vakata.dnd.drag(evt);
  });
  */