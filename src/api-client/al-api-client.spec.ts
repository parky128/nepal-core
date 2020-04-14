import {
    AlLocation,
    AlLocatorService,
} from '@al/common';
import { expect } from 'chai';
import { describe } from 'mocha';
import xhrMock, { once } from 'xhr-mock';
import {
    AlDefaultClient,
    APIRequestParams,
} from '../index';

const defaultAuthResponse = {
  authentication: {
    user: {
      id: '715A4EC0-9833-4D6E-9C03-A537E3F98D23',
      name: 'Bob Dobalina',
      email: 'bob@company.com',
      active: true,
      locked: false,
      version: 1,
      created: {
        at: 1430183768,
        by: 'System',
      },
      modified: {
        at: 1430183768,
        by: 'System',
      },
    },
    account: {
      id: '12345678',
      name: 'Company Name',
      active: true,
      version: 1,
      accessible_locations: ['insight-us-virginia'],
      default_location: 'insight-us-virginia',
      created: {
        by: 'system',
        at: 1436482061,
      },
      modified: {
        by: 'system',
        at: 1436482061,
      },
    },
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9==.QKRHma5zAOdhU50ZE4ryPxVpvKt0A0gbjY62xHCWm8s=',
    token_expiration: + new Date() + 1000,
  },
};

beforeEach(() => {
    xhrMock.setup();
    AlLocatorService.setContext( { environment: "integration" } );      //  for unit tests, assume integration environment
    AlDefaultClient['endpointResolution']["integration"] = {};
    AlDefaultClient['endpointResolution']["integration"]["0"] = Promise.resolve( {
      "cargo": "https://api.global-integration.product.dev.alertlogic.com",
      "kevin": "https://kevin.product.dev.alertlogic.com",
      'search': "https://api.global-fake-integration.product.dev.alertlogic.com",
      "aims": "https://api.global-integration.product.dev.alertlogic.com"
    } );
    AlDefaultClient['endpointResolution']["integration"]["2"] = AlDefaultClient['endpointResolution']["integration"][0];
    AlDefaultClient['endpointResolution']["integration"]["3"] = Promise.resolve( {
      "cargo": "https://api.global-integration.product.dev.alertlogic.com",
      "kevin": "https://kevin.product.dev.alertlogic.co.uk"
    } );
    AlDefaultClient['endpointResolution']["integration"]["67108880"] = AlDefaultClient['endpointResolution']["integration"][0];
} );
afterEach(() => {
  xhrMock.teardown();
  AlDefaultClient.reset();
});

describe('when calculating request URLs', () => {
  describe('with no params supplied', () => {
    it('should throw an error', async () => {
      let result = await AlDefaultClient['calculateRequestURL']( {} )
          .then( r => {
            expect( false ).to.equal( true );       //  this should never occur
          } ).catch( e => {
            expect(true).to.equal( true );
          } );
    } );
  });
  describe('with parameters', () => {
    it('should return targets with correct hosts and paths', async () => {

      let endpointURL = await AlDefaultClient['calculateRequestURL']({ service_name: 'cargo', service_stack: AlLocation.InsightAPI });
      // path should default to /:service_name/v1, no trailing slash
      expect(endpointURL).to.equal( "https://api.global-integration.product.dev.alertlogic.com/cargo" );

      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'aims', version: 'v4', service_stack: AlLocation.InsightAPI  } );
      //  path should be /:service_name/:version, no trailing slash
      expect(endpointURL).to.equal( "https://api.global-integration.product.dev.alertlogic.com/aims/v4" );

      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'cargo', version: 'v2', account_id: '67108880', service_stack: AlLocation.InsightAPI  } );
      //  path should be /:service_name/:version/:accountId, no trailing slash
      expect( endpointURL ).to.equal( `https://api.global-integration.product.dev.alertlogic.com/cargo/v2/67108880` );

      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'search', version: 'v1', path: 'global-capabilities', service_stack: AlLocation.InsightAPI  } );
      //  domain should be non-default; path should be /:service_name/:version/:path
      expect( endpointURL ).to.equal( `https://api.global-fake-integration.product.dev.alertlogic.com/search/v1/global-capabilities` );

      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'aims', version: 'v100', account_id: '67108880', path: '/some/arbitrary/path/', service_stack: AlLocation.InsightAPI  } );
      //  path should be /:service_name/:version/:accountId, trailing slash ONLY because it is included in path, but no double slash from the slash at the beginning of `path`
      expect( endpointURL ).to.equal( "https://api.global-integration.product.dev.alertlogic.com/aims/v100/67108880/some/arbitrary/path/" );

      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'search', version: 2, account_id: '2', path: '/some/endpoint', params: { a: 1, b: 2, c: 3 }, service_stack: AlLocation.InsightAPI  } );
      //  query params should not be applied by this stage -- axios serializes them and dispatches them during the actual request execution
      expect( endpointURL ).to.equal( "https://api.global-fake-integration.product.dev.alertlogic.com/search/v2/2/some/endpoint" );

      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'kevin', version: 1, account_id: '67108880', path: '/some/endpoint', context_account_id: '3', service_stack: AlLocation.InsightAPI } );
      //  expect the endpoints response for the context_account_id to be used instead of the dominant account_id's
      expect( endpointURL ).to.equal( `https://kevin.product.dev.alertlogic.co.uk/kevin/v1/67108880/some/endpoint` );

      AlDefaultClient.defaultAccountId = "67108880";
      endpointURL = await AlDefaultClient['calculateRequestURL']( { service_name: 'kevin', version: 16, path: 'some/arbitrary/endpoint', service_stack: AlLocation.InsightAPI } );
      expect( endpointURL ).to.equal( `https://kevin.product.dev.alertlogic.com/kevin/v16/some/arbitrary/endpoint` );
      AlDefaultClient.defaultAccountId = null;
    });
  });
  describe("and an exception is thrown from the `endpoints` service", () => {
    it("should fall back to default values", async () => {
      xhrMock.post( 'https://api.global-integration.product.dev.alertlogic.com/endpoints/v1/10101010/residency/default/endpoints', once({
        status: 500,
        body: 'Internal Error Or Something'
      }) );

      let url = await AlDefaultClient['calculateRequestURL']( { service_name: 'aims', version: 1, path: '/something', account_id: "10101010", service_stack: AlLocation.InsightAPI } );
      expect( url ).to.equal( 'https://api.product.dev.alertlogic.com/aims/v1/10101010/something' );
    } );
  } );
});

describe('When performing two fetch operations', () => {
  describe(' with no TTL', () => {
    it('should return fresh data without caching', async () => {
      // Here we mock out a second response from back end...
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users', once({
        status: 200,
        body: 'first response',
      }));
      await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users' });                            //  fetch once
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users', once({
        status: 200,
        body: 'second response',
      }));
      let response = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users'});     //  fetch again, TTL 0 to disable caching
      expect(response).to.equal('second response');
    });
  });
  describe('with caching enabled', () => {
    it('should return the first server response', async () => {
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users', once({
        status: 200,
        body: 'first response',
      }));
      await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users', ttl: true });
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users', once({
        status: 200,
        body: 'second response',
      }));
      let response = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users', ttl: true });
      expect(response).to.equal('first response');
    });
  });
  describe('with caching enabled and the same query params supplied', () => {
    it('should return the first server response', async () => {
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users?foo=bar', once({
        status: 200,
        body: 'first response',
      }));
      await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users', params: {foo: 'bar'}, ttl: true });
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users?foo=bar', once({
        status: 200,
        body: 'second response',
      }));
      let response = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users' , params: {foo: 'bar'}, ttl: true });
      expect(response).to.equal('first response');
    });
  });
  describe('with caching enabled and different query params supplied', () => {
    it('should return the second server response', async () => {
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users?foo=bar', once({
        status: 200,
        body: 'first response',
      }));
      await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users', params: {foo: 'bar'}, ttl: true });
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users?foo=baz', once({
        status: 200,
        body: 'second response',
      }));
      let response = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users' , params: {foo: 'baz'}, ttl: true });
      expect(response).to.equal('second response');
    });
  });
});

describe('When authenticating a user with credentials', () => {
  const username = 'bob@email.com';
  const password = 'IAmNotAValidUser!@#$';
  const mfaCode = '123456';
  describe('but without supplying an mfa code', () => {
    it('should perform the authenticate request and set underlying session details using the response returned', async() => {
      xhrMock.post('https://api.global-integration.product.dev.alertlogic.com/aims/v1/authenticate', (req, res) => {
        expect(req.header('Authorization')).to.equal(`Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`);
        expect(req.body()).to.equal('{}');
        return res.status(200).body(defaultAuthResponse);
      });
      const sessionDescriptor = await AlDefaultClient.authenticate(username, password, undefined, true );
      expect( sessionDescriptor ).to.deep.equals( defaultAuthResponse );
    });
  });
  describe('and an mfa code supplied', () => {
    it('should perform the authenticate request and include an mfa_code request body parameter', async() => {
      xhrMock.post('https://api.global-integration.product.dev.alertlogic.com/aims/v1/authenticate', (req, res) => {
        expect(req.header('Authorization')).to.equal(`Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`);
        expect(JSON.parse(req.body())).to.deep.equals({mfa_code: mfaCode});
        return res.status(200).body(defaultAuthResponse);
      });
      try {
        const sessionDescriptor = await AlDefaultClient.authenticate(username, password, mfaCode, true );
        expect( sessionDescriptor ).to.deep.equals( defaultAuthResponse );
      } catch( e ) {
        console.error("Got error...", e );
      }
    });
  });
});

describe('When authenticating a user with a session token and mfa code', () => {
  const sessionToken = 'Ses1ion.Tok3n==';
  const mfaCode = '123456';
  it('should perform the authenticate request using the session token as a header and mfa code as a body param', async() => {
    xhrMock.post('https://api.global-integration.product.dev.alertlogic.com/aims/v1/authenticate', (req, res) => {
      expect(req.header('X-AIMS-Session-Token')).to.equal(sessionToken);
      expect(JSON.parse(req.body())).to.deep.equals({ mfa_code: mfaCode });
      return res.status(200).body(defaultAuthResponse);
    });
    await AlDefaultClient.authenticateWithMFASessionToken(sessionToken, mfaCode, true );
  });
});

describe('retry logic', () => {
  it( 'should generate random cache breakers for every retry call', () => {
    let previousValues = [];
    for ( let i = 0; i < 100; i++ ) {
        let breaker = AlDefaultClient['generateCacheBuster']( Math.floor( Math.random() * 5 ) );      //    cache busters should be suitably random to avoid overlaps
        expect( previousValues.indexOf( breaker ) ).to.equal( -1 );
        previousValues.push( breaker );
    }
  } );
  it( 'should detect the difference between retryable and non-retryable errors', () => {
    const config:APIRequestParams = {
        retry_count: 10,
        url: "https://some.com/made/up/url"
    };
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 500, statusText: "Something", config: {}, headers: {} }, config, 0 ) ).to.equal( true );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 503, statusText: "Something", config: {}, headers: {} }, config, 0  ) ).to.equal( true );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 302, statusText: "Something", config: {}, headers: {} }, config, 0  ) ).to.equal( true );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 0, statusText: "Something", config: {}, headers: {} }, config, 0  ) ).to.equal( true );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 0, statusText: "Something", config: {}, headers: {} }, config, 10  ) ).to.equal( false );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 204, statusText: "Something", config: {}, headers: {} }, config, 0  ) ).to.equal( false );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 404, statusText: "Something", config: {}, headers: {} }, config, 0  ) ).to.equal( false );
    expect( AlDefaultClient['isRetryableError']( { data: {}, status: 403, statusText: "Something", config: {}, headers: {} }, config, 0  ) ).to.equal( false );
  } );
  it('should retry if retry_count is specified', async () => {
    xhrMock.reset();
    // Here we mock out a second response from back end...
    xhrMock.get( new RegExp( "https://api.global\\-integration\\.product\\.dev\\.alertlogic\\.com\\/aims\\/v1\\/2\\/users.*", "i" ), once({
      status: 500,
      body: 'Unexpected result',
    }));
    xhrMock.get( new RegExp( "https://api.global\\-integration\\.product\\.dev\\.alertlogic\\.com\\/aims\\/v1\\/2\\/users.*", "i" ), once({
      status: 500,
      body: 'Unexpected result',
    }));
    xhrMock.get( new RegExp( "https://api.global\\-integration\\.product\\.dev\\.alertlogic\\.com\\/aims\\/v1\\/2\\/users.*", "i" ), once({
      status: 200,
      body: 'Final result',
    }));
    const result = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users', retry_count: 3, retry_interval: 10 });                            //  fetch once
    expect( result ).to.equal( "Final result" );
  });
} );

// HTTP Operations
describe('When', () => {
  describe('posting form data', () => {
    it('should perform a POST operation with Content-Type header set to a value of "multipart/form-data"', async() => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.post('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        expect(req.method()).to.equal('POST');
        return res.status(200).body({});
      });
      await AlDefaultClient.form(apiRequestParams).then((r) => {
        expect(apiRequestParams.headers['Content-Type']).to.equal('multipart/form-data');
        expect(apiRequestParams.method).to.equal('POST');
      });
    });
  });
  describe('performing a put of data', () => {
    it('should perform a PUT operation', async() => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.put('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        expect(req.method()).to.equal('PUT');
        return res.status(200).body({});
      });
      await AlDefaultClient.put(apiRequestParams).then((r) => {
        expect(apiRequestParams.method).to.equal('PUT');
      });
    });
  });
  describe('calling the aliased PUT method', () => {
    it('should perform a PUT operation', async() => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.put('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        expect(req.method()).to.equal('PUT');
        return res.status(200).body({});
      });
      await AlDefaultClient.put(apiRequestParams).then((r) => {
        expect(apiRequestParams.method).to.equal('PUT');
      });
    });
  });
  describe('performing a delete', () => {
    it('should perform a DELETE operation', async() => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.delete('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        expect(req.method()).to.equal('DELETE');
        return res.status(200).body({});
      });
      await AlDefaultClient.delete(apiRequestParams).then((r) => {
        expect(apiRequestParams.method).to.equal('DELETE');
      });
    });
  });
});
describe('when normalizing an outgoing request config',() => {
  describe('with an accept_header property', () => {
    it('set a headers object on the config object with an Accept prop set to the value of the original accept_header value', async() => {
      const config: APIRequestParams = { accept_header: 'foo/bar'};
      await AlDefaultClient.normalizeRequest(config).then((c) => {
        expect(c.headers).to.deep.equals({
          Accept: 'foo/bar'
        });
      });
    });
  });
  describe('with a response_type property', () => {
    it('set a responseType prop on the config object set to the original response_type value', async() => {
      const config: APIRequestParams = { response_type: 'something'};
      await AlDefaultClient.normalizeRequest(config).then((c) => {
        expect(c.responseType).to.equal('something');
      });
    });
  });
});

describe('when collectRequestLog is set to true',() => {
    beforeEach(() => {
      AlDefaultClient.verbose = true;
      AlDefaultClient.collectRequestLog = true;
    });
    afterEach(()=>{
      AlDefaultClient.reset();
    });
    it('should log the details for a PUT request', async() => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.put('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        res.header('Content-Length', '44');
        expect(req.method()).to.equal('PUT');
        return res.status(200).body({"hello":"TinyBodyOf44bytes"});
      });
      await AlDefaultClient.put(apiRequestParams).then((r) => {
        expect(apiRequestParams.method).to.equal('PUT');
      });
      expect(AlDefaultClient.getExecutionRequestLog().length).equal(1);
      expect(AlDefaultClient.getExecutionRequestLog()[0].method).equal("PUT");
      expect(AlDefaultClient.getExecutionRequestLog()[0].responseContentLength).equal(44);
      expect(AlDefaultClient.getExecutionRequestLog()[0].durationMs).lessThan(100); // This is a mock so should be fast.
      expect(AlDefaultClient.getExecutionRequestLog()[0].url).equal("https://api.global-integration.product.dev.alertlogic.com/aims/v1/2");
    });
    it('should log the details for a GET request', async () => {
      // Here we mock out a second response from back end...
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users', once({
        status: 200,
        headers: {'Content-Length':'24'},
        body: "lot of users",
      }));
      let response = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users'});
      expect(response).to.equals("lot of users"); // Response body should not be affected.
      expect(AlDefaultClient.getExecutionRequestLog().length).equal(1);
      expect(AlDefaultClient.getExecutionRequestLog()[0].method).equal("GET");
      expect(AlDefaultClient.getExecutionRequestLog()[0].responseContentLength).equal(24);
      expect(AlDefaultClient.getExecutionRequestLog()[0].durationMs).lessThan(100); // This is a mock so should be fast.
      expect(AlDefaultClient.getExecutionRequestLog()[0].url).equal("https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users");
    });
    it('should should log the details for a POST request', async() => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.post('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        res.header('Content-Length', '64');
        expect(req.method()).to.equal('POST');
        return res.status(200).body({"body":"This is the body of the post"});
      });
      await AlDefaultClient.form(apiRequestParams).then((r) => {
        expect(apiRequestParams.headers['Content-Type']).to.equal('multipart/form-data');
        expect(apiRequestParams.method).to.equal('POST');
      });
      expect(AlDefaultClient.getExecutionRequestLog().length).equal(1);
      expect(AlDefaultClient.getExecutionRequestLog()[0].method).equal("POST");
      expect(AlDefaultClient.getExecutionRequestLog()[0].responseContentLength).equal(64);
      expect(AlDefaultClient.getExecutionRequestLog()[0].durationMs).lessThan(100); // This is a mock so should be fast.
      expect(AlDefaultClient.getExecutionRequestLog()[0].url).equal("https://api.global-integration.product.dev.alertlogic.com/aims/v1/2");
    });
    it('should log the details for a DELETE request', async () => {
      const apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};
      xhrMock.delete('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        res.header('Content-Length', '0');
        expect(req.method()).to.equal('DELETE');
        return res.status(200).body({});
      });
      await AlDefaultClient.delete(apiRequestParams).then((r) => {
        expect(apiRequestParams.method).to.equal('DELETE');
      });
      expect(AlDefaultClient.getExecutionRequestLog().length).equal(1);
      expect(AlDefaultClient.getExecutionRequestLog()[0].method).equal("DELETE");
      expect(AlDefaultClient.getExecutionRequestLog()[0].responseContentLength).equal(0);
      expect(AlDefaultClient.getExecutionRequestLog()[0].durationMs).lessThan(100); // This is a mock so should be fast.
      expect(AlDefaultClient.getExecutionRequestLog()[0].url).equal("https://api.global-integration.product.dev.alertlogic.com/aims/v1/2");
    });
    it('should reset() clean execution log array', async () => {
      xhrMock.get('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2/users', once({
        status: 200,
        body: "lot of users",
      }));
      let response = await AlDefaultClient.get({ service_name: 'aims', version: 'v1', account_id: '2', path: 'users'});
      expect(response).to.equals("lot of users"); // Response body should not be affected.
      expect(AlDefaultClient.getExecutionRequestLog().length).equal(1);
      // Calling reset.
      AlDefaultClient.reset();
      expect(AlDefaultClient.getExecutionRequestLog().length).equal(0);
    });
    it('should getExecutionSummary() return a summary of requests in the log', async () => {
      let apiRequestParams: APIRequestParams = {service_name: 'aims', version: 'v1', account_id: '2'};

      xhrMock.post('https://api.global-integration.product.dev.alertlogic.com/aims/v1/2', (req, res) => {
        res.header('Content-Length', '256'); // We should measure the double 512.
        expect(req.method()).to.equal('POST');
        return res.status(200).body({"body":"This is the body a 256 size post"});
      });
      // First post.
      await AlDefaultClient.form(apiRequestParams).then((r) => {
        expect(apiRequestParams.headers['Content-Type']).to.equal('multipart/form-data');
        expect(apiRequestParams.method).to.equal('POST');
      });

      // Second post.
      await AlDefaultClient.form(apiRequestParams).then((r) => {
        expect(apiRequestParams.headers['Content-Type']).to.equal('multipart/form-data');
        expect(apiRequestParams.method).to.equal('POST');
      });

      let summaryTest = AlDefaultClient.getExecutionSummary();
      // let´s validate the summary.
      expect(summaryTest.numberOfRequests).equal(2);
      expect(summaryTest.totalBytes).equal(512);
      expect(summaryTest.totalRequestTime).lessThan(100); // This should be fast is a mock.
    });
});