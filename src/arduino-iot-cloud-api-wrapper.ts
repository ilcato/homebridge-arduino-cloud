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

// Arduino iot cloud api wrapper
'use strict';

const ArduinoIotClient = require('@arduino/arduino-iot-client');
const client = ArduinoIotClient.ApiClient.instance;

// Configure OAuth2 access token for authorization: oauth2
var oauth2 = client.authentications['oauth2'];
const apiProperties = new ArduinoIotClient.PropertiesV2Api(client);
const apiSeries = new ArduinoIotClient.SeriesV2Api(client);
const apiThings = new ArduinoIotClient.ThingsV2Api(client);

class ArduinoClientHttp {
  token;
  openConnections;
  
  constructor(token) {
    this.token = token;
    this.openConnections=0;
    if(process.env.API_BASE_PATH){
      client.basePath = process.env.API_BASE_PATH;
    }
  }
  updateToken(token) {
    this.token = token;
  }
  setProperty(thing_id, property_id, value) {
    const body = JSON.stringify({
      value: value
    });
    oauth2.accessToken = this.token;
    return apiProperties.propertiesV2Publish(thing_id, property_id, body);
  }
  getThings() {
    oauth2.accessToken = this.token;
    return apiThings.thingsV2List();
  }
  getThingsAndProperties() {
    var opts = {
      'showProperties': true
    };
    oauth2.accessToken = this.token;
    return apiThings.thingsV2List(opts);
  }
  getProperties(thingId) {
    oauth2.accessToken = this.token;
    return apiProperties.propertiesV2List(thingId);
  }
  getProperty(thingId, propertyId) {
    oauth2.accessToken = this.token;
    return apiProperties.propertiesV2Show(thingId, propertyId);
  }
  getSeries(thingId, propertyId, start, end) {

    const body =  JSON.stringify({
      requests: [{
        q: "property." + propertyId,
        from: start,
        to: end,
        sort: "ASC",
        series_limit: 86400
      }],
      resp_version: 1
    });
    oauth2.accessToken = this.token;
    return apiSeries.seriesV2BatchQueryRaw(body);
  }
}
exports.ArduinoClientHttp = ArduinoClientHttp;
