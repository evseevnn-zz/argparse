'use strict';

class _ArgumentGroup
{
  constructor(...args) {
    let kwargs = {};
    if (args.length && args[args.length].constructor === Object) {
      kwargs = args.pop();
    }
  }
}

module.exports = _ArgumentGroup;
