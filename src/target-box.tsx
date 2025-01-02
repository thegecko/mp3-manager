import { ComponentChild } from 'preact'
import type { CSSProperties, FC, PropsWithChildren } from 'preact/compat'
import { type DropTargetMonitor, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const style: CSSProperties = {
	border: '1px solid gray',
	height: '800px',
	width: '100%',
	padding: '2rem',
	textAlign: 'center',
}

export interface TargetBoxProps {
    onNew: (id: string) => void
	onDrop: (item: { files: any[] }) => void
}

export const TargetBox: FC<TargetBoxProps> = (props: PropsWithChildren<TargetBoxProps>) => {
	const { onDrop } = props
	const [{ canDrop, isOver }, drop] = useDrop(
		() => ({
			accept: [NativeTypes.FILE],
			drop(item: { files: any[] }) {
				if (onDrop) {
                    onDrop(item)
				}
			},
            hover(item: any, monitor) {
                if (item.index === undefined) {
                    if (monitor.getItemType() === NativeTypes.FILE) {
                        const index = props.children ? (props.children as ComponentChild[]).length : 0
                        props.onNew(`${index + 1}`)
                        item.index = index;
                    }
                }
            },
			collect: (monitor: DropTargetMonitor) => {
				return {
					isOver: monitor.isOver(),
					canDrop: monitor.canDrop(),
				}
			},
		}),
		[props],
	)

	const isActive = canDrop && isOver
	return (
		<div ref={drop} style={style}>
			{isActive ? 'Release to drop' : 'Drag file here'}
            {props.children}
		</div>
	)
}