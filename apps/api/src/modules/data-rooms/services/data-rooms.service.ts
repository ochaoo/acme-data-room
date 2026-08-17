import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthenticatedUser } from '../../auth/interfaces';
import { AccessControlService } from '../../sharing/services';
import { CreateDataRoomDto, UpdateDataRoomDto } from '../dto';
import { DataRoomsRepository } from '../repositories';

@Injectable()
export class DataRoomsService {
  constructor(
    private readonly dataRoomsRepository: DataRoomsRepository,
    private readonly accessControlService: AccessControlService,
  ) {}

  create(user: AuthenticatedUser, dto: CreateDataRoomDto) {
    return this.dataRoomsRepository.create(user.id, dto.name.trim());
  }

  listOwned(user: AuthenticatedUser) {
    return this.dataRoomsRepository.findOwnedBy(user.id);
  }

  async getById(user: AuthenticatedUser, dataRoomId: string) {
    const dataRoom = await this.dataRoomsRepository.findById(dataRoomId);

    if (!dataRoom) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
    }

    await this.accessControlService.assertCanViewDataRoom(user.id, dataRoom);
    return dataRoom;
  }

  async update(user: AuthenticatedUser, dataRoomId: string, dto: UpdateDataRoomDto) {
    await this.accessControlService.assertOwner(user.id, dataRoomId);
    return this.dataRoomsRepository.updateName(dataRoomId, dto.name.trim());
  }
}
