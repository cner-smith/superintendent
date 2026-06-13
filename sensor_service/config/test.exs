import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :sensor_service, SensorService.Repo,
  username: "superintendent",
  password: "superintendent",
  hostname: "127.0.0.1",
  port: 54329,
  database: "superintendent",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :sensor_service, SensorServiceWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "e4c4a/3oc/Iv3GqNXQcPV9EpWeUeB1GX1q5DdnJDfapn6WlSalGKLOO2vzlClNLQ",
  server: false

# Do not start the MQTT broker clients or simulated publisher in test.
# Tests exercise insert_reading/1 and the subscriber handler directly.
config :sensor_service, start_mqtt: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
