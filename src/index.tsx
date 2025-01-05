import { render } from 'preact';
import { App } from './app';
import './index.css'

const container = document.getElementById('root') as Element;
render(<App />, container);
