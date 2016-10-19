'use strict';

const { SUPPRESS } = require('../constants');
const Action = require('../Action');

class _HelpAction extends Action
{
  constructor({ option_strings, dest = SUPPRESS, defaultValue = SUPPRESS, help = null }) {
    super({ option_strings, dest, defaultValue, nargs: 0, help });

  }
}

module.exports = _HelpAction;
