import { router, telegramApi } from '../../App';
import { setDialogs, appendDialogs } from '../../store/store';
import template from './chat-page.html';
import { stopLoading } from '../../helpers/index';
import './chat-page.scss';
export default class ChatPage extends HTMLElement {
	constructor() {
		super();
	}

	render() {
		this.innerHTML = template;
		this.loadData();
	}

	connectedCallback() {
		this.render();
	}

	loadData = async () => {
		let first = true;
		const load = data => {
			if (first) {
				const left = document.getElementById('left');
				stopLoading(left);
				left.innerHTML = `<my-menu></my-menu><user-dialogs></user-dialogs>`;
				setDialogs(data);
				first = false;
			} else {
				appendDialogs(data);
			}
			window.updateRipple();
		};

		await telegramApi.getDialogsParsed(5).then(load);
		await telegramApi.getDialogsParsed(30).then(load);
	};
}
