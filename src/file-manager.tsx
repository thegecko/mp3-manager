import type { ComponentChild } from 'preact'
import type { PropsWithChildren } from 'preact/compat'
import { useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const style = {
	flex: 1,
    overflow: 'auto',
	padding: '1rem',
	textAlign: 'center',
}

export interface TargetBoxProps {
    onNew: () => any
	onDrop: (item: { files: any[] }) => void
}

export const FileManager = (props: PropsWithChildren<TargetBoxProps>) => {
	const { onDrop } = props
	const [, drop] = useDrop(
		() => ({
			accept: [NativeTypes.FILE],
			drop(item: { files: any[] }) {
				if (onDrop) {
                    onDrop(item)
				}
			},
            hover(item: any, monitor) {
                if (!item.id && monitor.getItemType() === NativeTypes.FILE) {
					item.id = props.onNew()
                }
            }
		}),
		[props],
	)

	const hasFiles = (props.children as ComponentChild[]).length > 0;
	return (
		<div ref={drop} style={style}>
			{hasFiles ? undefined : 'Drag Files Here'}
            {props.children}
		</div>
	)
}
