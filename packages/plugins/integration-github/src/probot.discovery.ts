import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import {
	Inject,
	Injectable,
	Logger,
	OnApplicationBootstrap,
	OnApplicationShutdown,
	OnModuleInit,
} from '@nestjs/common';
import { Probot } from 'probot';
import SmeeClient from 'smee-client';
import * as _ from 'underscore';
import { v4 } from 'uuid';
import { ModuleProviders, ProbotConfig } from './probot.types';
import { createProbot, createSmee } from './probot.helpers';
import { HookMetadataAccessor } from './hook-metadata.accessor';

@Injectable()
export class ProbotDiscovery implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {

	private readonly logger = new Logger('ProbotDiscovery');
	private readonly hooks: Map<string, any>;
	private smee: SmeeClient;
	private readonly probot: Probot;

	constructor(
		private readonly discoveryService: DiscoveryService,
		private readonly metadataAccessor: HookMetadataAccessor,
		private readonly metadataScanner: MetadataScanner,
		@Inject(ModuleProviders.ProbotConfig)
		private readonly config: ProbotConfig
	) {
		this.hooks = new Map<string, any>();
		this.probot = createProbot(this.config);
	}

	public async onModuleInit() {
		this.explore();
	}

	onApplicationBootstrap(): any {
		if (!_.isEmpty(this.config.webhookProxy)) {
			this.smee = createSmee(this.config);
			this.smee.start();
		}

		this.mountHooks();
	}

	onApplicationShutdown(signal?: string): any {
		// TODO clear probot event handlers on shutdown
	}

	mountHooks() {
		this.probot
			.load(
				(app: {
					on: (
						arg0: any,
						arg1: (context: any) => Promise<void>
					) => any;
				}) => {
					this.hooks.forEach((hook) => {
						app.on(
							hook.eventOrEvents,
							this.initContext(hook.target)
						);
					});
				}
			)
			.then(() => {
				this.logger.log('Hook event listeners initialized');
			})
			.catch(this.logger.error);
	}

	initContext(fn: (context: any) => any) {
		return async (context: any) => {
			await fn(context);
		};
	}

	explore() {
		const instanceWrappers: InstanceWrapper[] = [
			...this.discoveryService.getControllers(),
			...this.discoveryService.getProviders(),
		];

		instanceWrappers
			.filter((wrapper: InstanceWrapper) => wrapper.isDependencyTreeStatic())
			.forEach((wrapper: InstanceWrapper) => {
				const { instance } = wrapper;
				if (!instance || !Object.getPrototypeOf(instance)) {
					return;
				}

				const prototype = Object.getPrototypeOf(instance);
				const methodNames = this.metadataScanner.getAllMethodNames(prototype);

				methodNames.forEach((key: string) => this.lookupHooks(instance, key));
			});
	}

	lookupHooks(instance: Record<string, () => any>, key: string) {
		const methodRef = instance[key];
		const hookMetadata = this.metadataAccessor.getWebhookEvents(methodRef);
		const hookFn = this.wrapFunctionInTryCatchBlocks(methodRef, instance);

		// filter functions that do not have a webhook event definition
		if (_.isEmpty(hookMetadata)) {
			return null;
		}

		return this.hooks.set(v4(), {
			target: hookFn,
			eventOrEvents: hookMetadata,
		});
	}

	private wrapFunctionInTryCatchBlocks(
		methodRef: () => any,
		instance: Record<string, any>
	) {
		return async (...args: unknown[]) => {
			try {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				await methodRef.call(instance, ...args);
			} catch (error) {
				this.logger.error(error);
			}
		};
	}

	receiveHook(request: any) {
		const id = request.headers['x-github-delivery'] as string;
		const event = request.headers['x-github-event'];
		const body = request.body;

		console.log({ id, event, body });
		return this.probot.receive({ id, name: event, payload: body });
	}
}
