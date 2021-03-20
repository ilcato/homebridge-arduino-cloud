// MIT License

// Copyright (c) 2021 ilcato

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Arduino IoT Cloud Platform plugin for HomeBridge
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//			"platform": "ArduinoIoTCloud",
//			"name": "ArduinoIoTCloud",
//			"clientid": "YOUR_ARDUINO_IOT_CLOUD_CLIENTID",
//			"clientsecret": "YOUR_ARDUINO_IOT_CLOUD_CLIENT_SECRET"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

'use strict'

import { Config } from './config'
import {
	pluginName,
	platformName,
	ArduinoAccessory
} from './arduino-accessory';

import { arduinoConnectionManager } from './arduino-connection-manager';


let Accessory,
	Service,
	Characteristic,
	UUIDGen;

export = function (homebridge) {
	Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	UUIDGen = homebridge.hap.uuid;
	homebridge.registerPlatform(pluginName, platformName, ArduinoIoTCloudPlatform, true)
}

class ArduinoIoTCloudPlatform {
	log: (format: string, message: any) => void;
	config: Config;
	api: any;
	accessories: Map<string, any>;
	arduinoClientMqtt: any;
	arduinoClientHttp: any;

	constructor(log: (format: string, message: any) => void, config: Config, api: any) {
		this.log = log;
		this.api = api;

		this.accessories = new Map();
		this.config = config;

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));

	}
	async didFinishLaunching() {
		this.log('didFinishLaunching.', '')

		try {
			this.arduinoClientMqtt = await arduinoConnectionManager.getClientMqtt(this.config, this.log);
			this.arduinoClientHttp = await arduinoConnectionManager.getClientHttp(this.config, this.log);
			if (this.arduinoClientHttp === null) {
				this.log("Error connecting to Arduino IoT Cloud: ", "Cannot obtain http client.");
			}

			const things = await this.arduinoClientHttp.getThings();
			things.map(async (t, i, a) => {
				const properties = await this.arduinoClientHttp.getProperties(t.id)
				this.LoadAccessories(t, properties);
			});
			// Remove no more present accessories from cache
			let aa = this.accessories.values() // Iterator for accessories, key is the uniqueseed
			for (let a of aa) {
				if (!a.reviewed) {
					this.removeAccessory(a);
				}
			}
		} catch (err) {
			this.log("Error connecting to Arduino IoT Cloud: ", err);
		}
	}

	configureAccessory(accessory) {
		this.log("Configured Accessory: ", accessory.displayName);
		for (let s = 0; s < accessory.services.length; s++) {
			let service = accessory.services[s];
			for (let i = 0; i < service.characteristics.length; i++) {
				let characteristic = service.characteristics[i];
				if (characteristic.props.needsBinding) {
					this.bindCharacteristicEvents(characteristic, service);
					this.registerAutomaticUpdate(characteristic, service)
				}
			}
		}
		this.accessories.set(accessory.context.uniqueSeed, accessory);
		accessory.reachable = true;
	}

	LoadAccessories(thing, properties) {
		this.log('Loading accessories', '');
		if (!(properties instanceof Array))
			return;
		if (properties === null || properties.length === 0)
			return;
		properties.map((p, i, a) => {
			this.addAccessory(ArduinoAccessory.createArduinoAccessory(thing, p, Accessory, Service, Characteristic, this));
		});
	}

	addAccessory(arduinoAccessory) {
		if (arduinoAccessory === null)
			return;

		let uniqueSeed = arduinoAccessory.name;
		let isNewAccessory = false;
		let a: any = this.accessories.get(uniqueSeed);
		if (a == null) {
			isNewAccessory = true;
			let uuid = UUIDGen.generate(uniqueSeed);
			a = new Accessory(arduinoAccessory.name, uuid); // Create the HAP accessory
			a.context.uniqueSeed = uniqueSeed;
			this.accessories.set(uniqueSeed, a);
		}
		arduinoAccessory.setAccessory(a);
		// init accessory
		arduinoAccessory.initAccessory();
		// Remove services existing in HomeKit, device no more present in Arduino IoT Cloud
		//		arduinoAccessory.removeNoMoreExistingServices();
		// Add services present in Arduino IoT Cloud and not existing in Homekit accessory
		arduinoAccessory.addNewServices(this);
		// Register or update platform accessory
		arduinoAccessory.registerUpdateAccessory(isNewAccessory, this.api);
		this.log("Added/changed accessory: ", arduinoAccessory.name);
	}

	removeAccessory(accessory) {
		this.log('Remove accessory', accessory.displayName);
		this.api.unregisterPlatformAccessories(pluginName, platformName, [accessory]);
		this.accessories.delete(accessory.context.uniqueSeed);
	}

	async registerAutomaticUpdate(characteristic, service) {
		let params = service.subtype.split("|"); // params[0]: device_id, params[1]: thing_id, para[2]: property_id, para[3]: property_variable_name, para[4]: property_type
		//let device_id = params[0];
		let thing_id = params[1];
		//let property_id = params[2];        
		let property_variable_name = params[3];
		//let property_type = params[4];

		try {
			await this.arduinoClientMqtt.onPropertyValue(thing_id, property_variable_name, v => {
				switch (characteristic.UUID) {
					case (new Characteristic.On()).UUID:
						characteristic.updateValue(v);
						break;
					case (new Characteristic.Brightness()).UUID:
						let rBrightness = parseInt(v);
						if (rBrightness == 0) {
							service.characteristics[1].updateValue(false);
						} else {
							service.characteristics[1].updateValue(true);
						}
						characteristic.updateValue(rBrightness);
						break;
					case (new Characteristic.ContactSensorState()).UUID:
						characteristic.updateValue(v);
						break;
					case (new Characteristic.CurrentTemperature()).UUID:
						characteristic.updateValue(parseFloat(v));
						break;
					case (new Characteristic.CurrentAmbientLightLevel()).UUID:
						characteristic.updateValue(parseFloat(v));
						break;
					case (new Characteristic.MotionDetected()).UUID:
						characteristic.updateValue(v);
						break;
					case (new Characteristic.CurrentRelativeHumidity()).UUID:
						characteristic.updateValue(parseInt(v));
						break;
					default:
						break
				}
				this.log("Updating device: ", `${service.displayName}, characteristic: ${characteristic.displayName}, last value: ${v}`);
			});
		} catch (err) {
			this.log('Error subscribing to property value', err);;
		}
	}

	bindCharacteristicEvents(characteristic, service) {
		characteristic.on('set', (value, callback, context) => {
			callback();
			this.setCharacteristicValue(value, context, characteristic, service);
		});
		characteristic.on('get', (callback) => {
			callback(undefined, characteristic.value);
			this.getCharacteristicValue(characteristic, service);
		});
	}

	async setCharacteristicValue(value, context, characteristic, service) {
		if (context !== 'fromSetValue') {
			let params = service.subtype.split("|"); // params[0]: device_id, params[1]: thing_id, para[2]: property_id, para[3]: property_name, para[4]: property_type
			//let device_id = params[0];
			let thing_id = params[1];
			let property_id = params[2];
			//let property_name = params[3];
			//			let property_type = params[4];
			this.log("Setting device: ", `${service.displayName}, characteristic: ${characteristic.displayName}, value: ${value}`);
			try {
				switch (characteristic.UUID) {
					case (new Characteristic.On()).UUID:
						await this.arduinoClientHttp.setProperty(thing_id, property_id, value);
						break;
					case (new Characteristic.Brightness()).UUID:
						await this.arduinoClientHttp.setProperty(thing_id, property_id, value);
						break;
					default:
						break
				}
			} catch (error) {
				this.log("Error setting device: ", `${service.displayName}, characteristic: ${characteristic.displayName}, err: ${error}`);
			}
		}
	}


	getCharacteristicValue(characteristic, service) {
		let params = service.subtype.split("|"); // params[0]: device_id, params[1]: thing_id, para[2]: property_id, para[3]: property_name, para[4]: property_type
		//let device_id = params[0];        
		let thing_id = params[1];
		let property_id = params[2];
		//let property_name = params[3];  
		//let property_type = params[4];        

		this.arduinoClientHttp.getProperty(thing_id, property_id)
			.then(response => {
				let last_value = response.last_value;
				switch (characteristic.UUID) {
					case (new Characteristic.On()).UUID:
						let r = last_value;
						switch (typeof last_value) {
							case "string":
								r = (last_value === "false" || last_value === "0") ? false : true;
								break;
							case "number":
								r = last_value === 0 ? false : true;
								break;
						}
						characteristic.updateValue(r);
						break;
					case (new Characteristic.Brightness()).UUID:
						characteristic.updateValue(parseInt(last_value));
						break;
					case (new Characteristic.ContactSensorState()).UUID:
						characteristic.updateValue(last_value == "true" ? true : false);
						break;
					case (new Characteristic.CurrentTemperature()).UUID:
						characteristic.updateValue(parseFloat(last_value));
						break;
					case (new Characteristic.CurrentAmbientLightLevel()).UUID:
						characteristic.updateValue(parseFloat(last_value));
						break;
					case (new Characteristic.MotionDetected()).UUID:
						characteristic.updateValue(last_value == "true" ? true : false);
						break;
					case (new Characteristic.CurrentRelativeHumidity()).UUID:
						characteristic.updateValue(parseInt(last_value));
						break;
					default:
						break
				}
				this.log("Getting device: ", `${service.displayName}, characteristic: ${characteristic.displayName}, last value: ${last_value}`);
			})
			.catch(err => {
				this.log("Getting device: ", `${service.displayName}, characteristic: ${characteristic.displayName}, last value: not connected yet`);
			});
	}
}