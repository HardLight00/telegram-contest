import './js/lib/polyfill';
import './js/lib/config';
import MtpNetworkerFactoryModule from './js/Mtp/MtpNetworkerFactory';
import MtpApiManagerModule from './js/Mtp/MtpApiManager';
import AppPeersManagerModule from './js/App/AppPeersManager';
import MtpApiFileManagerModule from './js/Mtp/MtpApiFileManager';
import AppUsersManagerModule from './js/App/AppUsersManager';
import AppProfileManagerModule from './js/App/AppProfileManager';
import MtpPasswordManagerModule from './js/Mtp/MtpPasswordManager';
import AppsChatsManagerModule from './js/App/AppChatsManager';
import FileSaverModule from './js/Etc/FileSaver';
import { nextRandomInt } from './js/lib/bin_utils';
import { isArray, isFunction, forEach, map, min } from './js/Etc/Helper';
import $timeout from './js/Etc/angular/$timeout';
import { Config } from './js/lib/config';

export default class TelegramApi {
	options = { dcID: 2, createNetworker: true };

	MtpApiManager = new MtpApiManagerModule();
	AppPeersManager = new AppPeersManagerModule();
	MtpApiFileManager = new MtpApiFileManagerModule();
	AppUsersManager = new AppUsersManagerModule();
	AppProfileManager = new AppProfileManagerModule();
	AppChatsManager = new AppsChatsManagerModule();
	MtpPasswordManager = new MtpPasswordManagerModule();
	FileSaver = new FileSaverModule();
	MtpNetworkerFactory = MtpNetworkerFactoryModule();

	constructor() {
		this.MtpNetworkerFactory.setUpdatesProcessor(message => {
			switch (message._) {
				case 'updates':
					this.AppChatsManager.saveApiChats(message.chats);
					this.AppUsersManager.saveApiUsers(message.users);
					break;
			}
		});

		this.setConfig({
			app: {
				id: 1166576 /* App ID */,
				hash: '99db6db0082e27973ee4357e4637aadc' /* App hash */,
				version: '0.0.1' /* App version */,
			},
			server: {
				test: [
					{ id: 1, host: '149.154.175.10', port: 443 },
					{ id: 2, host: '149.154.167.40', port: 443 },
					{ id: 3, host: '149.154.175.117', port: 443 },
				],
				production: [
					{ id: 1, host: '149.154.175.50', port: 443 },
					{ id: 2, host: '149.154.167.50', port: 443 },
					{ id: 3, host: '149.154.175.100', port: 443 },
					{ id: 4, host: '149.154.167.91', port: 443 },
					{ id: 5, host: '149.154.171.5', port: 443 },
				],
			},
			mode: {
				test: false,
				debug: true,
			},
		});
	}

	invokeApi = (method, params) => this.MtpApiManager.invokeApi(method, params);

	sendCode = phone_number =>
		this.MtpApiManager.invokeApi(
			'auth.sendCode',
			{
				phone_number: phone_number,
				sms_type: 5,
				api_id: Config.App.id,
				api_hash: Config.App.hash,
				lang_code: navigator.language || 'en',
			},
			this.options
		);

	signIn = (phone_number, phone_code_hash, phone_code) =>
		this.MtpApiManager.invokeApi(
			'auth.signIn',
			{
				phone_number: phone_number,
				phone_code_hash: phone_code_hash,
				phone_code: phone_code,
			},
			this.options
		).then(result => {
			this.MtpApiManager.setUserAuth(this.options.dcID, {
				id: result.user.id,
			});
			return result;
		});

	signIn2FA = password =>
		this.MtpPasswordManager.getState().then(result => {
			return this.MtpPasswordManager.check(result, password, this.options).then(result => {
				this.MtpApiManager.setUserAuth(this.options.dcID, {
					id: result.user.id,
				});
				return result;
			});
		});

	setUp2FA = (old_password, password, email, hint) =>
		this.MtpPasswordManager.getState().then(result => {
			return this.MtpPasswordManager.updateSettings(result, {
				cur_password: old_password,
				new_password: password,
				email: email,
				hint: hint,
			});
		});

	signUp = (phone_number, phone_code_hash, phone_code, first_name, last_name) =>
		this.MtpApiManager.invokeApi(
			'auth.signUp',
			{
				phone_number: phone_number,
				phone_code_hash: phone_code_hash,
				phone_code: phone_code,
				first_name: first_name || '',
				last_name: last_name || '',
			},
			this.options
		).then(result => {
			this.MtpApiManager.setUserAuth(this.options.dcID, {
				id: result.user.id,
			});
		});

	sendMessage = (id, message) =>
		this.MtpApiManager.invokeApi('messages.sendMessage', {
			flags: 0,
			peer: this.AppPeersManager.getInputPeerByID(id),
			message: message,
			random_id: [nextRandomInt(0xffffffff), nextRandomInt(0xffffffff)],
			reply_to_msg_id: 0,
			entities: [],
		});

	startBot = botName =>
		this.MtpApiManager.invokeApi('contacts.search', { q: botName, limit: 1 }).then(result => {
			this.AppUsersManager.saveApiUsers(result.users);
			return this.sendMessage(result.users[0].id, '/start');
		});

	sendSms = (phone_number, phone_code_hash, next_type) => {
		return this.MtpApiManager.invokeApi(
			'auth.resendCode',
			{
				phone_number: phone_number,
				phone_code_hash: phone_code_hash,
				next_type: next_type,
			},
			this.options
		);
	};

	setConfig = config => {
		config = config || {};

		config.app = config.app || {};
		config.server = config.server || {};

		config.server.test = config.server.test || [];
		config.server.production = config.server.production || [];

		config.mode.test = config.mode.test || false;
		config.mode.debug = config.mode.debug || false;

		Config.App.id = config.app.id;
		Config.App.hash = config.app.hash;
		Config.App.version = config.app.version || Config.App.version;

		Config.Server.Test = config.server.test;
		Config.Server.Production = config.server.production;

		Config.Modes.test = config.mode.test;
		Config.Modes.debug = config.mode.debug;

		this.MtpApiManager.invokeApi('help.getNearestDc', {}, this.options).then(nearestDcResult => {
			if (nearestDcResult.nearest_dc != nearestDcResult.this_dc) {
				this.MtpApiManager.getNetworker(nearestDcResult.nearest_dc, { createNetworker: true });
			}
		});
	};

	createChat = (title, userIDs) => {
		title = title || '';
		userIDs = userIDs || [];

		if (!isArray(userIDs)) {
			throw new Error('[userIDs] is not array');
		}

		const inputUsers = [];

		for (let i = 0; i < userIDs.length; i++) {
			inputUsers.push(this.AppUsersManager.getUserInput(userIDs[i]));
		}

		return this.MtpApiManager.invokeApi('messages.createChat', {
			title: title,
			users: inputUsers,
		}).then(updates => {
			// TODO: Remove
			if (updates.chats && updates.chats[0]) {
				return this.MtpApiManager.invokeApi('messages.toggleChatAdmins', {
					chat_id: updates.chats[0].id,
					enabled: true,
				});
			} else {
				return updates;
			}
		});
	};

	getChatLink = (chatID, force) => this.AppProfileManager.getChatInviteLink(chatID, force);

	getUserInfo = () =>
		this.MtpApiManager.getUserID().then(id => {
			const user = this.AppUsersManager.getUser(id);

			if (!user.id || !user.deleted) {
				return user;
			} else {
				return this.MtpApiManager.invokeApi('users.getFullUser', {
					id: { _: 'inputUserSelf' },
				}).then(userInfoFull => {
					this.AppUsersManager.saveApiUser(userInfoFull.user);
					return this.AppUsersManager.getUser(id);
				});
			}
		});

	getUserPhoto = (type, size) => {
		return this.getUserInfo().then(user => {
			if (!user.photo) {
				return null;
			}

			const photo = size === 'small' ? user.photo.photo_small : user.photo.photo_big;
			const location = {
				_: 'inputFileLocation',
				local_id: photo.local_id,
				secret: photo.secret,
				volume_id: photo.volume_id,
			};
			const params = {
				dcID: this.options.dcID,
				fileDownload: true,
				singleInRequest: window.safari !== undefined,
				createNetworker: true,
			};

			return this.MtpApiManager.invokeApi(
				'upload.getFile',
				{
					location: location,
					offset: 0,
					limit: 524288,
				},
				params
			).then(result => {
				switch (type) {
					case 'byteArray':
						return result.bytes;
					case 'base64':
						return 'data:image/jpeg;base64,' + btoa(String.fromCharCode.apply(null, result.bytes));
					case 'blob':
						return new Blob([result.bytes], { type: 'image/jpeg' });
					default:
						return result.bytes;
				}
			});
		});
	};

	logOut = () => this.MtpApiManager.logOut();

	createChannel = (title, about) =>
		this.MtpApiManager.invokeApi(
			'channels.createChannel',
			{
				title: title || '',
				flags: 0,
				about: about || '',
			},
			this.options
		).then(data => {
			this.AppChatsManager.saveApiChats(data.chats);
			return data;
		});

	getHistory = params => {
		params = params || {};
		params.id = params.id || 0;
		params.take = params.take || 15;
		params.skip = params.skip || 0;
		params.type = params.type || 'chat';

		if (params.type == 'chat' && params.id > 0) {
			params.id = params.id * -1;
		}

		return this.MtpApiManager.invokeApi('messages.getHistory', {
			peer: this.AppPeersManager.getInputPeerByID(params.id),
			offset_id: 0,
			add_offset: params.skip,
			limit: params.take,
		});
	};

	sendFile = params => {
		params = params || {};
		params.id = params.id || 0;
		params.type = params.type || 'chat';
		params.file = params.file || {};
		params.caption = params.caption || '';

		if (params.type == 'chat' && params.id > 0) {
			params.id = params.id * -1;
		}

		return this.MtpApiFileManager.uploadFile(params.file).then(inputFile => {
			const file = params.file;

			inputFile.name = file.name;

			const inputMedia = {
				_: 'inputMediaUploadedDocument',
				file: inputFile,
				mime_type: file.type,
				caption: params.caption,
				attributes: [{ _: 'documentAttributeFilename', file_name: file.name }],
			};

			return this.MtpApiManager.invokeApi('messages.sendMedia', {
				peer: this.AppPeersManager.getInputPeerByID(params.id),
				media: inputMedia,
				random_id: [nextRandomInt(0xffffffff), nextRandomInt(0xffffffff)],
			});
		});
	};

	downloadDocument = (doc, progress, autosave) => {
		doc = doc || {};
		doc.id = doc.id || 0;
		doc.access_hash = doc.access_hash || 0;
		doc.attributes = doc.attributes || [];
		doc.size = doc.size || 0;

		if (!isFunction(progress)) {
			progress = noop;
		}

		const location = {
			_: 'inputDocumentFileLocation',
			id: doc.id,
			access_hash: doc.access_hash,
		};
		let fileName = 'FILE';
		let size = 15728640;
		let limit = 524288;
		let offset = 0;
		return new Promise((resolve, request) => {
			const bytes = [];

			if (doc.size > size) {
				throw new Error('Big file not supported');
			}

			size = doc.size;

			forEach(doc.attributes, attr => {
				if (attr._ == 'documentAttributeFilename') {
					fileName = attr.file_name;
				}
			});

			const download = () => {
				if (offset < size) {
					this.MtpApiManager.invokeApi('upload.getFile', {
						location: location,
						offset: offset,
						limit: limit,
					}).then(result => {
						bytes.push(result.bytes);
						offset += limit;
						progress(offset < size ? offset : size, size);
						download();
					});
				} else {
					if (autosave) {
						this.FileSaver.save(bytes, fileName);
					}
					resolve({
						bytes: bytes,
						fileName: fileName,
						type: doc.mime_type,
					});
				}
			};

			$timeout(download);
		});
	};

	joinChat = link => {
		let regex;
		let hash;

		regex = link.match(/^https:\/\/telegram.me\/joinchat\/([\s\S]*)/);

		if (regex) {
			hash = regex[1];
		} else {
			hash = link;
		}

		return this.MtpApiManager.invokeApi('messages.importChatInvite', { hash: hash }).then(updates => {
			this.AppChatsManager.saveApiChats(updates.chats);
			this.AppUsersManager.saveApiUsers(updates.users);
		});
	};

	editChatAdmin = (chatID, userID, isAdmin) => {
		if (typeof isAdmin == 'undefined') {
			isAdmin = true;
		}

		isAdmin = !!isAdmin;
		chatID = this.AppChatsManager.getChatInput(chatID);
		userID = this.AppUsersManager.getUserInput(userID);

		return this.MtpApiManager.invokeApi('messages.editChatAdmin', {
			chat_id: chatID,
			user_id: userID,
			is_admin: isAdmin,
		});
	};

	editChatTitle = (chat_id, title) =>
		this.MtpApiManager.invokeApi('messages.editChatTitle', {
			chat_id: chat_id,
			title: title,
		});

	editChannelAdmin = (channel_id, user_id) =>
		this.MtpApiManager.invokeApi('channels.editAdmin', {
			channel: this.AppChatsManager.getChannelInput(channel_id),
			user_id: this.AppUsersManager.getUserInput(user_id),
			role: { _: 'channelRoleEditor' },
		});

	getFullChat = chat_id => MtpApiManager.invokeApi('messages.getFullChat', { chat_id: chat_id });

	downloadPhoto = (photo, progress, autosave) => {
		const photoSize = photo.sizes[photo.sizes.length - 1];
		const location = {
			_: 'inputFileLocation',
			local_id: photoSize.location.local_id,
			secret: photoSize.location.secret,
			volume_id: photoSize.location.volume_id,
		};

		if (!isFunction(progress)) {
			progress = noop;
		}

		const fileName = photo.id + '.jpg';
		let size = 15728640;
		let limit = 524288;
		let offset = 0;

		return new Promise((resolve, reject) => {
			const bytes = [];

			if (photoSize.size > size) {
				throw new Error('Big file not supported');
			}

			size = photoSize.size;

			const download = () => {
				if (offset < size) {
					this.MtpApiManager.invokeApi('upload.getFile', {
						location: location,
						offset: offset,
						limit: limit,
					}).then(result => {
						bytes.push(result.bytes);
						offset += limit;
						progress(offset < size ? offset : size, size);
						download();
					});
				} else {
					if (autosave) {
						this.FileSaver.save(bytes, fileName);
					}
					resolve({
						bytes: bytes,
						fileName: fileName,
						type: 'image/jpeg',
					});
				}
			};

			$timeout(download);
		});
	};

	editChannelTitle = (channel_id, title) =>
		this.MtpApiManager.invokeApi('channels.editTitle', {
			channel: this.AppChatsManager.getChannelInput(channel_id),
			title: title,
		});

	deleteMessages = ids => {
		if (!isArray(ids)) {
			ids = [ids];
		}

		return this.MtpApiManager.invokeApi('messages.deleteMessages', { id: ids });
	};

	subscribe = (id, handler) => {
		this.MtpNetworkerFactory.subscribe(id, handler);
	};

	unSubscribe = id => {
		this.MtpNetworkerFactory.unSubscribe(id);
	};

	getPeerByID = (id, type) => {
		type = type || 'user';

		if ((type == 'chat' || type == 'channel') && id > 0) {
			id = -id;
		}

		const peer = this.AppPeersManager.getPeer(id);

		return new Promise((resolve, reject) => {
			if (!peer.deleted) {
				return resolve(peer);
			}

			let offsetDate = 0;
			let dialogsLoaded = 0;
			let totalCount = 0;

			(load = () => {
				this.MtpApiManager.invokeApi('messages.getDialogs', {
					offset_peer: this.AppPeersManager.getInputPeerByID(0),
					limit: 100,
					offset_date: offsetDate,
				}).then(
					result => {
						this.AppChatsManager.saveApiChats(result.chats);
						this.AppUsersManager.saveApiUsers(result.users);

						dialogsLoaded += result.dialogs.length;
						totalCount = result.count;

						const peer = this.AppPeersManager.getPeer(id);

						if (!peer.deleted) {
							resolve(peer);
							return;
						}

						if (totalCount && dialogsLoaded < totalCount) {
							const dates = map(result.messages, msg => {
								return msg.date;
							});
							offsetDate = min(dates);
							load();
							return;
						}

						reject({ type: 'PEER_NOT_FOUND' });
					},
					err => {
						reject(err);
					}
				);
			})();
		});
	};

	getDocumentPreview = doc => {
		const location = doc.thumb.location;
		let limit = 524288;

		location._ = 'inputFileLocation';

		if (doc.thumb.size > limit) {
			throw new Error('Size of document exceed limit');
		}

		return this.MtpApiManager.invokeApi('upload.getFile', {
			location: location,
			offset: 0,
			limit: limit,
		});
	};

	editChatPhoto = (chat_id, photo) => {
		return this.MtpApiFileManager.uploadFile(photo).then(inputFile => {
			return this.MtpApiManager.invokeApi('messages.editChatPhoto', {
				chat_id: chat_id,
				photo: {
					_: 'inputChatUploadedPhoto',
					file: inputFile,
					crop: {
						_: 'inputPhotoCropAuto',
					},
				},
			});
		});
	};

	editChannelPhoto = (channel_id, photo) => {
		return this.MtpApiFileManager.uploadFile(photo).then(inputFile => {
			return this.MtpApiManager.invokeApi('channels.editPhoto', {
				channel: this.AppChatsManager.getChannelInput(channel_id),
				photo: {
					_: 'inputChatUploadedPhoto',
					file: inputFile,
					crop: {
						_: 'inputPhotoCropAuto',
					},
				},
			});
		});
	};

	checkPhone = phone_number => this.MtpApiManager.invokeApi('auth.checkPhone', { phone_number: phone_number });

	getDialogs = (offset, limit) => {
		offset = offset || 0;
		limit = limit || 50;

		return this.MtpApiManager.invokeApi('messages.getDialogs', {
			offset_peer: this.AppPeersManager.getInputPeerByID(0),
			offset_date: offset,
			limit: limit,
		}).then(dialogsResult => {
			this.AppUsersManager.saveApiUsers(dialogsResult.users);
			this.AppChatsManager.saveApiChats(dialogsResult.chats);

			const dates = map(dialogsResult.messages, msg => {
				return msg.date;
			});

			return {
				result: dialogsResult,
				offset: min(dates),
			};
		});
	};

	getMessages = ids => {
		if (!isArray(ids)) {
			ids = [ids];
		}

		return this.MtpApiManager.invokeApi('messages.getMessages', { id: ids }).then(updates => {
			this.AppUsersManager.saveApiUsers(updates.users);
			this.AppChatsManager.saveApiChats(updates.chats);

			return updates;
		});
	};

	//processing methods go from here

	_convertDate = date => {
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

		let time = new Date(date * 1000);
		const currentTime = new Date();

		const startOfTheWeek = date => {
			const now = date ? new Date(date) : new Date();
			now.setHours(0, 0, 0, 0);
			const monday = new Date(now);
			monday.setDate(1);
			return monday;
		};

		const formatTime = t => (t < 10 ? '0' + t : t);

		if (time.getDay() - currentTime.getDay() === 0) {
			time = `${formatTime(time.getHours())}:${formatTime(time.getMinutes())}`;
		} else if (time.getDay() > startOfTheWeek(time)) {
			time = days[time.getDay()];
		} else {
			time = time.toLocaleDateString().replace(/[/]/g, '.');
			time = time.slice(0, 6) + time.slice(8);
		}

		return time;
	};

	spamMyself = async message => {
		this.invokeApi('messages.sendMessage', {
			peer: {
				_: 'inputPeerSelf',
			},
			message,
			random_id: Math.round(Math.random() * 100000),
		});
	};

	getDialogsParsed = async limit => {
		const { result } = await this.getDialogs(0, limit);

		const { chats, dialogs, messages, users } = result;

		const dialog_items = [];

		await dialogs.forEach(async dialog => {
			let peer = dialog.peer;
			let title, status, photo, onlineInfo;
			if (peer._ === 'peerChat') {
				const chat = chats[chats.findIndex(el => el.id === peer.chat_id)];
				title = chat.title;
				if (chat.photo._ !== 'chatPhotoEmpty') {
					photo = chat.photo;
				}
			} else if (peer._ === 'peerChannel') {
				const idx = chats.findIndex(el => el.id === peer.channel_id);
				const channel = chats[idx];
				title = channel.title;
				if (channel.photo._ !== 'chatPhotoEmpty') {
					photo = channel.photo;
				}
				peer = {
					...peer,
					access_hash: channel.access_hash,
				};
			} else {
				const user = users[users.findIndex(el => el.id === peer.user_id)];
				const last_name = user.last_name ? ' ' + user.last_name : '';
				title = user.first_name + last_name;
				status = user.status;
				if (user.photo && user.first_name !== 'Telegram') {
					photo = user.photo;
				}
				peer = user.access_hash
					? {
							...peer,
							access_hash: user.access_hash,
					  }
					: peer;
			}
			const message = messages[messages.findIndex(el => el.id === dialog.top_message)];
			const { message: text, date } = message;
			const unread_count = dialog.unread_count;

			dialog_items.push({
				title: title,
				isOnline: status && status._ === 'userStatusOnline',
				text: text,
				time: this._convertDate(date),
				unreadCount: unread_count,
				dialog_peer: peer,
				photo,
			});
		});

		dialog_items.sort((a, b) => a.time - b.time);

		return dialog_items;
	};

	mapPeerToTruePeer = peer => {
		const type = peer._;
		if (type === 'peerUser') {
			return {
				...peer,
				_: 'inputPeerUser',
				user_id: peer.user_id.toString(),
			};
		} else if (type === 'peerChat') {
			return {
				...peer,
				_: 'inputPeerChat',
				chat_id: peer.chat_id.toString(),
			};
		} else if (type === 'peerChannel') {
			return {
				...peer,
				_: 'inputPeerChannel',
				channel_id: peer.channel_id.toString(),
			};
		}
		return peer;
	};

	searchPeers = async (subsrt, limit) => {
		const res = await this.invokeApi('contacts.search', {
			q: subsrt,
			limit,
		});

		const { results, users, chats } = res;

		const search_items = [];

		await results.forEach(async result => {
			let peer, title, text, photo, status;

			if (result._ === 'peerChat') {
				const chat = chats[chats.findIndex(el => el.id === result.chat_id)];
				title = chat.title;
				text =
					chat.participants_count > 1
						? chat.participants_count + ' members'
						: chat.participants_count + ' member';
				photo = chat.photo;
				peer = {
					...result,
					access_hash: chat.access_hash,
				};
			} else if (result._ === 'peerChannel') {
				const channel = chats[chats.findIndex(el => el.id === result.channel_id)];
				title = channel.title;
				text =
					channel.participants_count > 1
						? channel.participants_count + ' members'
						: channel.participants_count + ' member';
				photo = channel.photo;
				peer = {
					...result,
					access_hash: channel.access_hash,
				};
			} else {
				const user = users[users.findIndex(el => el.id === result.user_id)];
				const last_name = user.last_name ? ' ' + user.last_name : '';
				title = user.first_name + last_name;
				status = user.status;
				text = '@' + user.username;
				photo = user.photo;
				peer = user.access_hash
					? {
							...result,
							access_hash: user.access_hash,
					  }
					: result;
			}

			search_items.push({
				title,
				peer,
				text,
				status,
				photo,
			});
		});

		return search_items;
	};

	getMessagesFromPeer = async (peer, limit = 200, offsetId = 0) => {
		return await this.invokeApi('messages.getHistory', {
			peer: this.mapPeerToTruePeer(peer),
			limit,
			offset_id: offsetId,
		});
	};

	getPhotoFile = async location => {
		return await this.invokeApi(
			'upload.getFile',
			{
				location: {
					_: 'inputFileLocation',
					// dc_id: 2,
					// local_id: 100767,
					// secret: "6658604105320603709",
					// volume_id: "257713757",
					dc_id: location.dc_id,
					local_id: location.local_id,
					secret: location.secret,
					volume_id: location.volume_id,
				},
				offset: 0,
				limit: 1048576,
			},
			{ fileDownload: true }
		)
			.then(res => {
				return 'data:image/png;base64,' + btoa(String.fromCharCode(...new Uint8Array(res.bytes)));
			})
			.catch(err => {
				if (err.type === 'FILEREF_UPGRADE_NEEDED') {
					return null;
				}
			});
	};
}