# Alice Invest deployment

Deploy Guardian as the local supervisor for Alice, optional UTA and optional
Connector. Bind external access through the documented loopback/tunnel model;
do not expose sealed credentials. Use pnpm docker:smoke for container
acceptance. The topology remains Guardian to Alice to optional UTA and Connector.

The Docker smoke requires a running Docker Desktop Linux engine; it must pass
before a deployment is considered validated.
