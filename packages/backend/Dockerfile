FROM golang:1.26.5-alpine3.24 AS build
WORKDIR /app
COPY packages/backend/go.mod packages/backend/go.sum ./
RUN go mod download
COPY packages/backend/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server .

FROM alpine:3.24
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /server /server
EXPOSE 8080
CMD ["/server"]
