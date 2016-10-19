'use strict';

const deprecate = require('depd')('argparse');
const constants = require('./constants');

module.exports = Object.assign({
  ArgumentParser:                 require('./ArgumentParser'),
  ArgumentError:                  null,
  ArgumentTypeError:              null,
  FileType:                       null,
  HelpFormatter:                  null,
  ArgumentDefaultsHelpFormatter:  null,
  RawDescriptionHelpFormatter:    null,
  RawTextHelpFormatter:           null,
  Namespace:                      null,
  Action:                         null,
  Const:                          constants
}, constants);

deprecate.property(module.exports, 'Const', 'Using Const deprecated. See README.md');
