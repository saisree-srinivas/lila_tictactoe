.PHONY: all build build-local restart

all: build restart

build:
	docker run --rm -w "/backend" -v "${PWD}/backend:/backend" heroiclabs/nakama-pluginbuilder:3.21.1 build --trimpath --buildmode=plugin -o backend.so

build-local:
	CGO_ENABLED=1 GOOS=linux go build --buildmode=plugin -o backend.so

restart:
	docker compose restart nakama
