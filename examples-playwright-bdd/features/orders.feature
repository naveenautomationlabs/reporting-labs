@feature:orders
Feature: Orders API

  Rule: Orders can be placed

    @P0 @blocker @story:SHOP-12
    Scenario: Place an order
      Given I am logged in as "ravi"
      When I post an order:
        """
        {"productId": 3, "qty": 9}
        """
      Then the order is created
      And I can cancel it

    Scenario: Check product prices
      Then these products cost:
        | id | price |
        | 1  | 5     |
        | 2  | 12.3  |

  Rule: Orders need a login

    Scenario: No token is rejected
      When I post an order without a token
      Then the API answers 401

    Scenario: Track an order
      When I track order "ord-123"
