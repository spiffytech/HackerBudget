import * as Types from './types';

export interface POJO {
  id: string;
  name: string;
  type: Types.BucketTypes;
}

export default class BucketReference {
  public static POJO({name, id, type}: POJO) {
    return new BucketReference({name, id, type});
  }

  public static Empty(type: Types.BucketTypes) {
    return new BucketReference({name: '', id: '', type});
  }

  public name: string;
  public id: string;
  protected type: Types.BucketTypes;

  constructor({name, id, type}: {name: string, id: string, type: Types.BucketTypes}) {
    this.name = name;
    this.id = id;
    this.type = type;
  }

  public toPOJO(): POJO {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
    };
  }
}
