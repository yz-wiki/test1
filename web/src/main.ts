import { mount } from 'svelte';
import './design/tokens.css';
import './design/base.css';
import './design/components.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('missing #app');

export default mount(App, { target });
