import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CustomerEntity } from './customer.entity';
import { ProjectEntity } from '../projects/project.entity';
import { NoteEntity } from '../notes/note.entity';
import {
  AppBadRequestException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

export interface CustomerDetail extends CustomerEntity {
  notes: NoteEntity[];
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(NoteEntity)
    private readonly noteRepo: Repository<NoteEntity>,
  ) {}

  /**
   * @param organizationIds - undefined = kein Org-Filter (nur für Administratoren
   * zulässig), leeres Array = User gehört keiner Organisation an -> keine Kunden
   */
  async findAll(organizationIds?: string[]): Promise<CustomerEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    return this.repo.find({
      where: organizationIds ? { organizationId: In(organizationIds) } : {},
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CustomerEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Kunden-Detailansicht: Kunde inkl. seiner Projekte (die "History" - neueste
   * zuerst) und seiner Notizen inkl. Fotos.
   */
  async findOneDetailed(id: string): Promise<{
    customer: CustomerEntity;
    projects: ProjectEntity[];
    notes: NoteEntity[];
  } | null> {
    const customer = await this.repo.findOne({ where: { id } });
    if (!customer) {
      return null;
    }

    const [projects, notes] = await Promise.all([
      this.projectRepo.find({
        where: { customerId: id },
        order: { createdAt: 'DESC' },
      }),
      this.noteRepo.find({
        where: { customerId: id },
        relations: ['photos'],
        order: { createdAt: 'DESC' },
      }),
    ]);

    return { customer, projects, notes };
  }

  async create(data: {
    name: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    organizationId: string;
  }): Promise<CustomerEntity> {
    const customer = this.repo.create(data);
    return this.repo.save(customer);
  }

  async update(
    id: string,
    data: Partial<
      Pick<CustomerEntity, 'name' | 'contactEmail' | 'contactPhone' | 'address'>
    >,
  ): Promise<CustomerEntity> {
    const customer = await this.repo.findOne({ where: { id } });
    if (!customer) {
      throw new AppNotFoundException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        `Customer with ID ${id} not found`,
        { id },
      );
    }
    Object.assign(customer, data);
    return this.repo.save(customer);
  }

  async delete(id: string): Promise<void> {
    const customer = await this.repo.findOne({ where: { id } });
    if (!customer) {
      throw new AppNotFoundException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        `Customer with ID ${id} not found`,
        { id },
      );
    }

    // Projekte verweisen zwingend auf einen Kunden (customerId NOT NULL,
    // kein CASCADE) - ein Kunde mit bestehenden Projekten muss erst von
    // seinen Projekten befreit werden, sonst verliert der Admin ungewollt
    // die komplette History. Klare Fehlermeldung statt rohem FK-Fehler.
    const projectCount = await this.projectRepo.count({
      where: { customerId: id },
    });
    if (projectCount > 0) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        `Kunde hat noch ${projectCount} Projekt(e) - diese müssen zuerst gelöscht werden`,
        { projectCount },
      );
    }

    await this.repo.remove(customer);
  }
}
