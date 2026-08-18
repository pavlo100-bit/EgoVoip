import { toSipUri } from '../src/sip/SipEngine';
import { formatDuration } from '../src/theme/theme';

jest.mock('jssip', () => ({ WebSocketInterface: class {}, UA: class {}, C: { causes: {} } }));
jest.mock('react-native-incall-manager', () => ({}));

describe('toSipUri', () => {
  it('qualifies a bare number with the registered domain', () => {
    expect(toSipUri('0501234567', 'pbx.example.com')).toBe(
      'sip:0501234567@pbx.example.com',
    );
  });

  it('keeps E.164 and feature-code characters', () => {
    expect(toSipUri('+972501234567', 'pbx.io')).toBe('sip:+972501234567@pbx.io');
    expect(toSipUri('*8000', 'pbx.io')).toBe('sip:*8000@pbx.io');
  });

  it('strips formatting a user pasted from Contacts', () => {
    expect(toSipUri('(050) 123-4567', 'pbx.io')).toBe('sip:0501234567@pbx.io');
  });

  it('passes full URIs through untouched', () => {
    expect(toSipUri('sip:alice@other.com', 'pbx.io')).toBe('sip:alice@other.com');
    expect(toSipUri('alice@other.com', 'pbx.io')).toBe('sip:alice@other.com');
  });

  it('rejects input with no dialable characters', () => {
    expect(toSipUri('   ', 'pbx.io')).toBeNull();
    expect(toSipUri('abc', 'pbx.io')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats under an hour as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
  });

  it('adds hours only when needed', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});
